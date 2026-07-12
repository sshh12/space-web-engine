# foolrate.py — R4 blind-panel pair builder (ROADMAP_V2 Phase R).
# Builds normalized real-vs-render pair montages for the forced-choice panel:
#   - band-matched pairs only (whole-disk / ground), non-iconic random crops
#   - ONE normalization pipeline: crop -> resize 384 -> JPEG q85 re-encode for
#     BOTH sides (reference compression must not be the tell)
#   - left/right assignment seeded; answer key kept out of the panel's prompts
#   - real-vs-real control pairs calibrate the judge-noise baseline
#   - R4 ARTIFACT MASKS: per-ref crop windows + exclusion masks come from
#     bench/manifest.json (single source of truth). The round-2 harness finding
#     was that crops caught rover hardware, Hasselblad reseau crosshairs and
#     mosaic stitch borders, biasing measured fool-rate LOW; a crop overlapping
#     any masked rect is now rejected, so the panel never judges an instrument.
# Usage: python bench/foolrate.py   (writes bench/out/foolrate/pair-*.jpg + key.json)
import json, os, random, io
from PIL import Image, ImageDraw

random.seed(20260703)
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "out", "foolrate")
os.makedirs(OUT, exist_ok=True)

# ---- artifact masks + crop windows from the manifest (R4) ----
# keyed by ref path relative to bench/ ; { "crop_window": [x0,y0,x1,y1],
# "mask": [[x0,y0,x1,y1], ...] } in relative coords. Absent -> no restriction.
def load_masks():
    try:
        mf = json.load(open(os.path.join(ROOT, "manifest.json")))
    except Exception:
        return {}
    out = {}
    for e in mf.get("entries", []):
        f = e.get("file")
        if not f or not isinstance(f, str) or f.endswith("/"):
            continue
        rel = f[len("bench/"):] if f.startswith("bench/") else f
        if "crop_window" in e or "mask" in e:
            out[rel] = {"crop_window": e.get("crop_window"), "mask": e.get("mask", [])}
    return out
MASKS = load_masks()

# (band, path, inline_crop_window) — the manifest overrides inline when present,
# so crop windows live in exactly one place; masks come from the manifest only.
REALS = [
    ("tellus-disk", "refs/tellus/epic-fulldisk-01.png", (0.16, 0.16, 0.84, 0.84)),
    ("tellus-disk", "refs/tellus/epic-fulldisk-02.png", (0.16, 0.16, 0.84, 0.84)),
    ("luna-disk", "refs/luna/apollo-fulldisk-01.jpg", (0.22, 0.18, 0.78, 0.82)),
    ("luna-disk", "refs/luna/apollo-fulldisk-02.jpg", (0.25, 0.2, 0.75, 0.8)),
    ("luna-ground", "refs/luna/apollo-ground-01.jpg", (0.02, 0.25, 0.52, 0.98)),
    ("rubra-ground", "refs/rubra-ground/perseverance_jezero_floor_expanse_01.jpg", None),
    ("rubra-ground", "refs/rubra-ground/perseverance_santa_cruz_boulders_01.jpg", None),
    ("rubra-ground", "refs/rubra-ground/perseverance_falbreen_ripples_panorama_01.jpg", None),
    ("rubra-ground", "refs/rubra-ground/perseverance_neretva_vallis_dunes_01.jpg", None),
    ("rubra-ground", "refs/rubra-ground/perseverance_pico_turquino_hills_01.jpg", None),
    ("rubra-ground", "refs/rubra-ground/perseverance_skrinkle_haven_rocks_01.jpg", None),
    ("rubra-ground", "refs/rubra-ground/perseverance_lookout_hill_vista_01.jpg", None),
    ("rubra-ground", "refs/rubra-ground/perseverance_regolith_holes_surface_01.jpg", None),
]

def crop_for(rel, inline):
    m = MASKS.get(rel)
    if m and m.get("crop_window"):
        return tuple(m["crop_window"])
    return inline

def mask_for(rel):
    m = MASKS.get(rel)
    return (m.get("mask") if m else None) or []

def _rects_overlap(a, b):
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])
# renders per band: matched-geometry shots (foolrate-shots) + bench stills
RENDERS = {
    "tellus-disk": ["out/foolrate-shots/fr-tellus-disk-01.png", "out/foolrate-shots/fr-tellus-disk-02.png"],
    "luna-disk": ["out/foolrate-shots/fr-luna-disk-01.png", "out/foolrate-shots/fr-luna-disk-02.png"],
    "luna-ground": ["out/stills/luna-boulderfield.png", "out/stills/pavement-walk-luna.png", "out/stills/crater-rim-walk.png"],
    "rubra-ground": ["out/stills/pavement-walk-rubra.png", "out/stills/boulder-macro-rubra.png", "out/stills/dune-field-edge.png", "out/stills/rubra-canyon-dawn.png"],
}
PAIRS_PER_REF = {"tellus-disk": 3, "luna-disk": 3, "luna-ground": 4, "rubra-ground": 2}
CROP_FRAC = {"tellus-disk": 0.42, "luna-disk": 0.42, "luna-ground": 0.5, "rubra-ground": 0.4}
S = 384

def normalize(img, box_rel, frac, mask=None):
    W0, H0 = img.size
    if box_rel:
        bx0, by0 = int(box_rel[0] * W0), int(box_rel[1] * H0)
        sub = img.crop((bx0, by0, int(box_rel[2] * W0), int(box_rel[3] * H0)))
    else:
        bx0, by0, sub = 0, 0, img
    w, h = sub.size
    side = int(min(w, h) * frac)
    x = random.randint(0, w - side); y = random.randint(0, h - side)
    # reject crops overlapping a masked artifact region (R4): retry up to 16x,
    # then accept the last (better a slight overlap than an infinite loop)
    for _ in range(16):
        if not mask:
            break
        r = ((bx0 + x) / W0, (by0 + y) / H0, (bx0 + x + side) / W0, (by0 + y + side) / H0)
        if not any(_rects_overlap(r, m) for m in mask):
            break
        x = random.randint(0, w - side); y = random.randint(0, h - side)
    c = sub.crop((x, y, x + side, y + side)).resize((S, S), Image.LANCZOS)
    # the one re-encode both sides go through
    buf = io.BytesIO()
    c.convert("RGB").save(buf, "JPEG", quality=85)
    return Image.open(io.BytesIO(buf.getvalue()))

def usable(img, lo=6, hi=249):
    g = img.convert("L")
    m = sum(g.getdata()) / (S * S)
    return lo < m < hi  # not empty space, not blown

def montage(a, b):
    out = Image.new("RGB", (S * 2 + 48, S + 44), (24, 24, 26))
    d = ImageDraw.Draw(out)
    out.paste(a, (16, 32)); out.paste(b, (S + 32, 32))
    d.text((16 + S // 2, 8), "A", fill=(240, 240, 240))
    d.text((S + 32 + S // 2, 8), "B", fill=(240, 240, 240))
    return out

def load(rel):
    p = os.path.join(ROOT, rel)
    return Image.open(p) if os.path.exists(p) else None

key, idx, masked_refs = [], 0, set()
for band, ref_rel, inline in REALS:
    ref = load(ref_rel)
    if ref is None:
        print("missing ref", ref_rel); continue
    renders = [r for r in (load(x) for x in RENDERS[band]) if r]
    if not renders:
        print("no renders for", band); continue
    box, mask = crop_for(ref_rel, inline), mask_for(ref_rel)
    if mask:
        masked_refs.add(ref_rel)
    for _ in range(PAIRS_PER_REF[band]):
        for attempt in range(24):
            rc = normalize(ref, box, CROP_FRAC[band], mask)
            xc = normalize(random.choice(renders), None, CROP_FRAC[band])
            if usable(rc) and usable(xc):
                break
        real_is_a = random.random() < 0.5
        m = montage(rc if real_is_a else xc, xc if real_is_a else rc)
        name = f"pair-{idx:03d}.jpg"
        m.save(os.path.join(OUT, name), quality=92)
        key.append({"file": name, "band": band, "real": "A" if real_is_a else "B", "control": False, "ref": ref_rel, "masked": ref_rel in masked_refs})
        idx += 1

# real-vs-real controls: judge noise baseline (the designated "real" slot is
# arbitrary; a fair judge scores ~50% here)
by_band = {}
for band, rel, inline in REALS:
    by_band.setdefault(band, []).append((rel, crop_for(rel, inline), mask_for(rel)))
for band, refs in by_band.items():
    if len(refs) < 2:
        continue
    n = 4 if band == "rubra-ground" else 3
    for _ in range(n):
        (r1, b1, m1), (r2, b2, m2) = random.sample(refs, 2)
        a = normalize(load(r1), b1, CROP_FRAC[band], m1)
        b = normalize(load(r2), b2, CROP_FRAC[band], m2)
        real_is_a = random.random() < 0.5
        m = montage(a if real_is_a else b, b if real_is_a else a)
        name = f"pair-{idx:03d}.jpg"
        m.save(os.path.join(OUT, name), quality=92)
        key.append({"file": name, "band": band, "real": "A" if real_is_a else "B", "control": True, "ref": f"{r1}|{r2}"})
        idx += 1

with open(os.path.join(OUT, "key.json"), "w") as f:
    json.dump(key, f, indent=1)
print(f"wrote {idx} pairs -> {OUT}")
print(f"artifact masks active on {len(masked_refs)} ref(s): {sorted(masked_refs) or '(none — add crop_window/mask to bench/manifest.json entries)'}")
