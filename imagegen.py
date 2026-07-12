#!/usr/bin/env python
"""imagegen - a thin, general-purpose CLI over OpenAI's gpt-image-2 Image API.

Not tied to textures (or anything): callers supply their own prompts. Three API
subcommands (generate / edit / tile) plus a local-only preview helper.

  generate   text prompt -> image(s)
  edit       one or more input images (+ optional mask) + prompt -> image
  tile       make an image seamlessly tileable (offset-50% + inpaint the seam)
  preview    local NxN montage of an image to eyeball tiling (no API call)

Prompts are never hardcoded here. Pass them with --prompt, --prompt-file, or
"--prompt -" to read from stdin.

Model is fixed to gpt-image-2.

Auth: reads OPENAI_API_KEY from the environment, or from a .env file in the
current dir / repo root (no python-dotenv dependency).

Examples
  # generate
  python tools/imagegen.py generate --prompt "a red sphere" --size 1024x1024 -o out.png

  # generate from a prompt file, 2 variants, high quality
  python tools/imagegen.py generate --prompt-file p.txt -n 2 -q high -o sphere.png

  # edit with reference images
  python tools/imagegen.py edit -i a.png -i b.png --prompt "combine these" -o c.png

  # make an existing texture seamless and check it
  python tools/imagegen.py tile -i tex.png --prompt "<same prompt as gen>" -o tex_seamless.png --check
  python tools/imagegen.py preview -i tex_seamless.png --grid 3 -o check.png
"""
import argparse
import base64
import io
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

MODEL = "gpt-image-2"
# gpt-image-2 size constraints (docs): edges multiple of 16, max edge 3840,
# ratio <= 3:1, total pixels in [655360, 8294400].
MIN_PIXELS = 655_360
MAX_PIXELS = 8_294_400
MAX_EDGE = 3840


def load_dotenv_key():
    """Populate OPENAI_API_KEY from a .env in cwd or repo root, if not already set."""
    if os.environ.get("OPENAI_API_KEY"):
        return
    here = Path.cwd()
    for d in [here, *here.parents]:
        env = d / ".env"
        if env.is_file():
            for line in env.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
            if os.environ.get("OPENAI_API_KEY"):
                return


def read_prompt(args):
    if args.prompt == "-":
        return sys.stdin.read().strip()
    if args.prompt is not None:
        return args.prompt
    if args.prompt_file:
        return Path(args.prompt_file).read_text(encoding="utf-8").strip()
    raise SystemExit("error: provide a prompt via --prompt, --prompt-file, or '--prompt -'")


def out_paths(out, n):
    """Expand an output path into n paths. For n>1, insert _1, _2, ... before suffix."""
    p = Path(out)
    if n == 1:
        return [p]
    return [p.with_name(f"{p.stem}_{i + 1}{p.suffix}") for i in range(n)]


def save_b64(b64, path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(base64.b64decode(b64))


def write_manifest(stem, data):
    """Write a sidecar <stem>.json recording the prompt + params that produced an
    output, so any set is reproducible / self-describing for downstream consumers."""
    p = Path(stem).with_suffix(".json")
    p.parent.mkdir(parents=True, exist_ok=True)
    body = {"tool": "imagegen", "created": datetime.now(timezone.utc).isoformat()}
    body.update({k: v for k, v in data.items() if v is not None})
    p.write_text(json.dumps(body, indent=2), encoding="utf-8")
    print(f"[manifest] wrote {p}")
    return p


def common_image_kwargs(args):
    """Build the kwargs shared by generate/edit (size, quality, format, etc.)."""
    kw = {"model": MODEL, "n": args.n, "size": args.size, "quality": args.quality}
    if getattr(args, "background", None):
        kw["background"] = args.background
    if getattr(args, "moderation", None):
        kw["moderation"] = args.moderation
    if getattr(args, "format", None):
        kw["output_format"] = args.format
    if getattr(args, "compression", None) is not None:
        kw["output_compression"] = args.compression
    return kw


def client():
    from openai import OpenAI

    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("error: OPENAI_API_KEY not set (env or .env)")
    return OpenAI()


def report_usage(res):
    """Print the API's reported token usage + an estimated $ cost. Rates are
    gpt-image-1's published $/1M tokens (text-in 5, image-in 10, image-out 40);
    gpt-image-2 may differ -- scale by your real per-token price if so."""
    u = getattr(res, "usage", None)
    if not u:
        return
    g = lambda o, k, d=0: getattr(o, k, d) if o is not None else d
    it, ot = g(u, "input_tokens"), g(u, "output_tokens")
    det = getattr(u, "input_tokens_details", None)
    txt, img = g(det, "text_tokens"), g(det, "image_tokens")
    cost = txt * 5e-6 + img * 10e-6 + ot * 40e-6
    print(f"[usage] input={it} (text={txt} image_ref={img}) output={ot} "
          f"total={g(u,'total_tokens', it+ot)} | est_cost=${cost:.4f} "
          f"(gpt-image-1 rates; output dominates)")


# --------------------------------------------------------------------------- #
# subcommands
# --------------------------------------------------------------------------- #
def cmd_generate(args):
    prompt = read_prompt(args)
    kw = common_image_kwargs(args)
    if args.dry_run:
        print(f"[dry-run] images.generate {kw}\nprompt:\n{prompt}")
        return
    res = client().images.generate(prompt=prompt, **kw)
    written = [str(p) for p in out_paths(args.out, args.n)]
    for path, item in zip(out_paths(args.out, args.n), res.data):
        save_b64(item.b64_json, path)
        print(f"[generate] wrote {path}")
    report_usage(res)
    write_manifest(args.out, {"command": "generate", "model": MODEL, "prompt": prompt,
                              "size": args.size, "quality": args.quality, "n": args.n,
                              "format": getattr(args, "format", None), "outputs": written})


def cmd_edit(args):
    prompt = read_prompt(args)
    kw = common_image_kwargs(args)
    if args.dry_run:
        print(f"[dry-run] images.edit {kw}\nimages: {args.image}\nmask: {args.mask}\nprompt:\n{prompt}")
        return
    images = [open(p, "rb") for p in args.image]
    mask = open(args.mask, "rb") if args.mask else None
    if mask is not None:
        kw["mask"] = mask  # only include when present; the SDK rejects mask=None
    try:
        res = client().images.edit(
            image=images if len(images) > 1 else images[0],
            prompt=prompt,
            **kw,
        )
    finally:
        for f in images:
            f.close()
        if mask:
            mask.close()
    written = [str(p) for p in out_paths(args.out, args.n)]
    for path, item in zip(out_paths(args.out, args.n), res.data):
        save_b64(item.b64_json, path)
        print(f"[edit] wrote {path}")
    report_usage(res)
    write_manifest(args.out, {"command": "edit", "model": MODEL, "prompt": prompt,
                              "inputs": args.image, "mask": args.mask, "size": args.size,
                              "quality": args.quality, "outputs": written})


def _valid_size(w, h):
    msgs = []
    if w % 16 or h % 16:
        msgs.append("edges must be multiples of 16")
    if max(w, h) > MAX_EDGE:
        msgs.append(f"max edge is {MAX_EDGE}")
    if not (MIN_PIXELS <= w * h <= MAX_PIXELS):
        msgs.append(f"total pixels must be in [{MIN_PIXELS}, {MAX_PIXELS}] (got {w * h})")
    if max(w, h) / min(w, h) > 3.0001:
        msgs.append("aspect ratio must be <= 3:1")
    return msgs


def cmd_tile(args):
    """Seamless-tile an image: roll by 50% so seams meet in the center, then have
    the model inpaint the seam cross. Output tiles cleanly on all four edges."""
    import numpy as np
    from PIL import Image, ImageDraw

    prompt = read_prompt(args)
    src = Image.open(args.image[0]).convert("RGB")

    # Decide working size: explicit --size, else the source size if it's valid.
    if args.size and args.size != "auto":
        w, h = (int(x) for x in args.size.lower().split("x"))
        src = src.resize((w, h), Image.LANCZOS)
    else:
        w, h = src.size
    problems = _valid_size(w, h)
    if problems:
        raise SystemExit(
            f"error: size {w}x{h} invalid for gpt-image-2: {'; '.join(problems)}.\n"
            "       pass a valid --size (e.g. 1024x1024, 1536x1024, 2048x2048, 2880x2880)."
        )

    # Roll so the original borders meet at the center cross.
    arr = np.asarray(src)
    rolled = np.roll(arr, shift=(h // 2, w // 2), axis=(0, 1))
    rolled_img = Image.fromarray(rolled)

    # Mask: transparent (alpha 0) = "edit here" for the OpenAI edit endpoint.
    # We expose a transparent cross over the rolled seam; everything else opaque.
    band_w = max(8, int(round(w * args.seam)))
    band_h = max(8, int(round(h * args.seam)))
    mask = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    d = ImageDraw.Draw(mask)
    d.rectangle([w // 2 - band_w // 2, 0, w // 2 + band_w // 2, h], fill=(0, 0, 0, 0))
    d.rectangle([0, h // 2 - band_h // 2, w, h // 2 + band_h // 2], fill=(0, 0, 0, 0))

    if args.dry_run:
        print(f"[dry-run] tile {w}x{h} seam={args.seam} q={args.quality}\nprompt:\n{prompt}")
        if args.debug_mask:
            mask.save(args.debug_mask)
            print(f"[dry-run] wrote mask {args.debug_mask}")
        return

    rb, mb = io.BytesIO(), io.BytesIO()
    rolled_img.save(rb, format="PNG")
    mask.save(mb, format="PNG")
    rb.seek(0)
    mb.seek(0)
    rb.name, mb.name = "image.png", "mask.png"
    if args.debug_mask:
        mask.save(args.debug_mask)

    res = client().images.edit(
        model=MODEL,
        image=rb,
        mask=mb,
        prompt=prompt,
        size=f"{w}x{h}",
        quality=args.quality,
        n=1,
    )
    out = out_paths(args.out, 1)[0]
    save_b64(res.data[0].b64_json, out)
    print(f"[tile] wrote {out}")
    write_manifest(args.out, {"command": "tile", "model": MODEL, "prompt": prompt,
                              "source": args.image[0], "size": f"{w}x{h}",
                              "seam": args.seam, "quality": args.quality, "outputs": [str(out)]})

    if args.check:
        chk = Path(out).with_name(Path(out).stem + "_check3x3.png")
        _montage(Image.open(out), 3).save(chk)
        print(f"[tile] wrote tiling check {chk}")


# --------------------------------------------------------------------------- #
# PBR derivation: turn one albedo into a UE5-ready material set, all derived
# locally so every map is pixel-aligned with (and as seamless as) the albedo.
# --------------------------------------------------------------------------- #
def _luma(rgb):
    import numpy as np

    a = rgb.astype(np.float32) / 255.0
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def _norm01(a):
    import numpy as np

    lo, hi = float(a.min()), float(a.max())
    return (a - lo) / (hi - lo) if hi > lo else np.zeros_like(a)


def _wrap_blur(a, radius):
    """Gaussian blur that wraps at the edges, so maps stay seamless. a in [0,1]."""
    import numpy as np
    from PIL import Image, ImageFilter

    if radius <= 0:
        return a
    pad = int(radius * 3) + 1
    p = np.pad(a, pad, mode="wrap")
    img = Image.fromarray((np.clip(p, 0, 1) * 255).astype(np.uint8))
    img = img.filter(ImageFilter.GaussianBlur(radius))
    return (np.asarray(img).astype(np.float32) / 255.0)[pad:-pad, pad:-pad]


def _grad_wrap(a):
    """Central-difference gradients that wrap (np.roll), preserving tileability."""
    import numpy as np

    gx = (np.roll(a, -1, axis=1) - np.roll(a, 1, axis=1)) * 0.5
    gy = (np.roll(a, -1, axis=0) - np.roll(a, 1, axis=0)) * 0.5
    return gx, gy


def derive_pbr(rgb, *, normal_strength, rough_min, rough_max, invert_rough,
               ao_radius, ao_strength, detail, directx):
    """Return dict of derived map arrays (float [0,1], uint8-ready) from an albedo."""
    import numpy as np

    luma = _luma(rgb)
    height = _norm01(luma)
    if detail > 0:  # high-pass: drop large-scale shading, keep surface relief
        height = _norm01(np.clip(0.5 + (height - _wrap_blur(height, detail)), 0, 1))

    gx, gy = _grad_wrap(height)
    nx, ny, nz = -gx * normal_strength, -gy * normal_strength, np.ones_like(height)
    if directx:  # UE5 expects DirectX-style normals (green points down)
        ny = -ny
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack([nx * inv, ny * inv, nz * inv], axis=-1) * 0.5 + 0.5

    r = _norm01(luma)
    if invert_rough:
        r = 1.0 - r
    roughness = rough_min + (rough_max - rough_min) * r

    # cheap cavity AO: pixels sitting below their blurred neighbourhood get darker
    cavity = _wrap_blur(height, ao_radius) - height
    ao = np.clip(1.0 - ao_strength * np.clip(cavity, 0, 1), 0, 1)

    metallic = np.zeros_like(height)
    orm = np.stack([ao, roughness, metallic], axis=-1)  # UE5 ORM packing
    return {
        "BaseColor": rgb,
        "Height": height,
        "Normal": normal,
        "Roughness": roughness,
        "AO": ao,
        "ORM": orm,
    }


def _save_map(arr, path):
    import numpy as np
    from PIL import Image

    a = np.asarray(arr)
    if a.dtype != np.uint8:
        a = (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(a).save(path)


def cmd_pbr(args):
    import numpy as np
    from PIL import Image

    # albedo: use --image if given, else generate one from the prompt.
    prompt = None
    if args.image:
        albedo = Image.open(args.image[0]).convert("RGB")
        if args.size and args.size != "auto":
            w, h = (int(x) for x in args.size.lower().split("x"))
            albedo = albedo.resize((w, h), Image.LANCZOS)
    else:
        prompt = read_prompt(args)
        if args.dry_run:
            print(f"[dry-run] pbr would generate albedo {args.size} q={args.quality}\nprompt:\n{prompt}")
            return
        res = client().images.generate(model=MODEL, prompt=prompt, size=args.size,
                                       quality=args.quality, n=1)
        albedo = Image.open(io.BytesIO(base64.b64decode(res.data[0].b64_json))).convert("RGB")

    maps = derive_pbr(
        np.asarray(albedo),
        normal_strength=args.normal_strength,
        rough_min=args.rough_min, rough_max=args.rough_max, invert_rough=args.invert_rough,
        ao_radius=args.ao_radius, ao_strength=args.ao_strength,
        detail=args.detail, directx=not args.opengl,
    )
    wanted = [m.strip() for m in args.maps.split(",")] if args.maps else list(maps)
    prefix = Path(args.out)
    prefix = prefix.with_suffix("") if prefix.suffix else prefix
    prefix.parent.mkdir(parents=True, exist_ok=True)
    written = []
    for name in wanted:
        key = {"basecolor": "BaseColor", "albedo": "BaseColor", "normal": "Normal",
               "roughness": "Roughness", "ao": "AO", "height": "Height", "orm": "ORM"}.get(name.lower())
        if not key:
            print(f"[pbr] skip unknown map '{name}'")
            continue
        out = prefix.with_name(f"{prefix.name}_{key}.png")
        _save_map(maps[key], out)
        written.append(str(out))
        print(f"[pbr] wrote {out}")
    write_manifest(prefix, {
        "command": "pbr", "model": MODEL if prompt else None,
        "prompt": prompt, "source_image": args.image[0] if args.image else None,
        "size": args.size, "quality": args.quality if prompt else None,
        "maps": wanted, "outputs": written,
        "derive": {"normal_strength": args.normal_strength, "detail": args.detail,
                   "rough_min": args.rough_min, "rough_max": args.rough_max,
                   "invert_rough": args.invert_rough, "ao_radius": args.ao_radius,
                   "ao_strength": args.ao_strength,
                   "normals": "opengl" if args.opengl else "directx"},
    })
    print("[pbr] UE5 import: BaseColor = sRGB; Normal/Roughness/AO/Height/ORM = uncheck sRGB (linear).\n"
          "      Normal default is DirectX (UE5); pass --opengl if it looks inverted.\n"
          "      ORM packing = R:AO  G:Roughness  B:Metallic. Plug ORM channels separately.")


def _png_bytes(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _plane_geometry(rep, displace, seg, hmap):
    """Quad in XZ facing +Y (glTF up), UVs tiled `rep` times, with a TANGENT attribute
    so normal maps bind reliably. If displace>0, subdivide into seg x seg and push
    vertices along Y by the height map for real geometric relief (normals recomputed)."""
    import numpy as np

    if displace <= 0:
        seg = 1
    n = seg + 1
    lin = np.linspace(0.0, 1.0, n)
    gx, gz = np.meshgrid(lin, lin)                 # fractions across the plane
    x, z = -1.0 + 2.0 * gx, -1.0 + 2.0 * gz
    if displace > 0:
        H, W = hmap.shape
        su = np.clip((gx * rep) % 1.0, 0, 0.999999)
        sv = np.clip((gz * rep) % 1.0, 0, 0.999999)
        h = hmap[(sv * H).astype(int), (su * W).astype(int)]
        y = (h - 0.5) * displace
        dy_dx = np.gradient(y, axis=1) * (seg / 2.0)   # x world-spacing is 2/seg
        dy_dz = np.gradient(y, axis=0) * (seg / 2.0)
        nrm = np.stack([-dy_dx, np.ones_like(y), -dy_dz], axis=-1)
        nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    else:
        y = np.zeros_like(x)
        nrm = np.zeros((n, n, 3), np.float32)
        nrm[..., 1] = 1.0

    pos = np.stack([x, y, z], axis=-1).reshape(-1, 3).astype(np.float32)
    uv = np.stack([gx * rep, gz * rep], axis=-1).reshape(-1, 2).astype(np.float32)
    nrm = nrm.reshape(-1, 3).astype(np.float32)
    tan = np.tile(np.array([1, 0, 0, -1], np.float32), (n * n, 1))  # +U dir, handedness

    a = (np.arange(seg)[:, None] * n + np.arange(seg)[None, :]).reshape(-1)
    b, c, d = a + 1, a + n, a + n + 1
    idx = np.stack([a, c, b, b, c, d], axis=-1).reshape(-1)
    idx = idx.astype(np.uint32 if pos.shape[0] > 65535 else np.uint16)
    return pos, nrm, uv, tan, idx


def cmd_glb(args):
    """Pack a PBR map set into a self-contained .glb (textured plane) for Babylon/any
    glTF viewer. Maps glTF metallic-roughness: baseColor(sRGB), ORM -> occlusion(R) +
    metallicRoughness(G,B), normal flipped to OpenGL (+Y up)."""
    import struct

    import numpy as np
    from PIL import Image

    prefix = Path(args.prefix)
    prefix = prefix.with_suffix("") if prefix.suffix else prefix

    def find(suffix, override):
        if override:
            return Path(override)
        p = prefix.with_name(f"{prefix.name}_{suffix}.png")
        return p if p.is_file() else None

    base_p = find("BaseColor", args.basecolor)
    if not base_p or not base_p.is_file():
        raise SystemExit(f"error: base color not found ({base_p}); pass --basecolor")
    normal_p = find("Normal", args.normal)
    orm_p = find("ORM", args.orm)
    rough_p = find("Roughness", None)
    ao_p = find("AO", None)

    base_img = Image.open(base_p).convert("RGB")
    W, H = base_img.size

    images = []  # list of (png_bytes,)

    def add_image(png):
        images.append(png)
        return len(images) - 1

    img_base = add_image(_png_bytes(base_img))

    img_normal = None
    if normal_p and normal_p.is_file():
        n = np.asarray(Image.open(normal_p).convert("RGB")).copy()
        n[..., 1] = 255 - n[..., 1]  # DirectX -> OpenGL (glTF wants +Y up)
        img_normal = add_image(_png_bytes(Image.fromarray(n)))

    # metallic-roughness + occlusion texture (glTF reads R=occ, G=rough, B=metal)
    img_mr = None
    if orm_p and orm_p.is_file():
        img_mr = add_image(_png_bytes(Image.open(orm_p).convert("RGB")))
    elif rough_p and rough_p.is_file():
        rough = np.asarray(Image.open(rough_p).convert("L"))
        ao = np.asarray(Image.open(ao_p).convert("L")) if ao_p and ao_p.is_file() else np.full_like(rough, 255)
        mr = np.stack([ao, rough, np.zeros_like(rough)], axis=-1)
        img_mr = add_image(_png_bytes(Image.fromarray(mr)))

    # height field for optional displacement (prefer the derived Height map)
    height_p = find("Height", None)
    if height_p and height_p.is_file():
        hmap = np.asarray(Image.open(height_p).convert("L"), dtype=np.float32) / 255.0
    else:
        b = np.asarray(base_img, dtype=np.float32) / 255.0
        hmap = 0.299 * b[..., 0] + 0.587 * b[..., 1] + 0.114 * b[..., 2]

    # geometry carries MACRO shape only; the normal map supplies fine grain. So
    # smooth the height before displacing, else per-pixel noise becomes spikes.
    if args.displace > 0 and args.displace_blur > 0:
        hmap = _wrap_blur(hmap, args.displace_blur * W)

    rep = float(args.repeat)
    pos, nrm, uv, tan, idx = _plane_geometry(rep, args.displace, args.displace_seg, hmap)
    nverts = pos.shape[0]
    idx_ct = 5125 if nverts > 65535 else 5123

    buf = bytearray()
    views = []

    def add_view(data, target=None):
        while len(buf) % 4:
            buf.append(0)
        off = len(buf)
        buf.extend(data)
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(data)}
                     | ({"target": target} if target else {}))
        return len(views) - 1

    v_pos = add_view(pos.tobytes(), 34962)
    v_nrm = add_view(nrm.tobytes(), 34962)
    v_uv = add_view(uv.tobytes(), 34962)
    v_tan = add_view(tan.tobytes(), 34962)
    v_idx = add_view(idx.tobytes(), 34963)
    img_views = [add_view(png) for png in images]

    accessors = [
        {"bufferView": v_pos, "componentType": 5126, "count": nverts, "type": "VEC3",
         "min": pos.min(0).tolist(), "max": pos.max(0).tolist()},
        {"bufferView": v_nrm, "componentType": 5126, "count": nverts, "type": "VEC3"},
        {"bufferView": v_uv, "componentType": 5126, "count": nverts, "type": "VEC2"},
        {"bufferView": v_tan, "componentType": 5126, "count": nverts, "type": "VEC4"},
        {"bufferView": v_idx, "componentType": idx_ct, "count": int(idx.shape[0]), "type": "SCALAR"},
    ]

    pbr = {"baseColorTexture": {"index": img_base}, "metallicFactor": 1.0, "roughnessFactor": 1.0}
    textures = [{"sampler": 0, "source": img_base}]  # source indexes the images[] array
    if img_mr is not None:
        pbr["metallicRoughnessTexture"] = {"index": len(textures)}
        occ_tex = len(textures)
        textures.append({"sampler": 0, "source": img_mr})
    material = {"pbrMetallicRoughness": pbr, "doubleSided": True, "name": "pbr"}
    if img_mr is not None:
        material["occlusionTexture"] = {"index": occ_tex}
    if img_normal is not None:
        material["normalTexture"] = {"index": len(textures), "scale": args.normal_scale}
        textures.append({"sampler": 0, "source": img_normal})

    # record what produced this set (sidecar manifest, if present) + glb params
    extras = {"glb": {"repeat": rep, "displace": args.displace, "normal_scale": args.normal_scale,
                      "maps": {"baseColor": base_p.name,
                               "normal": normal_p.name if normal_p else None,
                               "orm": orm_p.name if orm_p else None}}}
    man = prefix.with_suffix(".json")
    if man.is_file():
        try:
            extras["source"] = json.loads(man.read_text(encoding="utf-8"))
        except Exception:
            pass

    gltf = {
        "asset": {"version": "2.0", "generator": "imagegen", "extras": extras},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2, "TANGENT": 3},
                                    "indices": 4, "material": 0}]}],
        "materials": [material],
        "textures": textures,
        "images": [{"bufferView": img_views[i], "mimeType": "image/png"} for i in range(len(images))],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(buf)}],
    }

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    bin_bytes = bytes(buf) + b"\x00" * ((4 - len(buf) % 4) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A)); f.write(json_bytes)
        f.write(struct.pack("<II", len(bin_bytes), 0x004E4942)); f.write(bin_bytes)
    relief = f"displaced x{args.displace:g} ({args.displace_seg}seg)" if args.displace > 0 else "flat + normal map"
    print(f"[glb] wrote {out}  ({W}x{H}, {len(images)} tex, uv repeat {rep:g}, {nverts} verts, {relief})")
    print("[glb] view it: drag the .glb onto https://sandbox.babylonjs.com (or your Babylon viewer).")


def _montage(img, grid):
    from PIL import Image

    w, h = img.size
    out = Image.new("RGB", (w * grid, h * grid))
    for r in range(grid):
        for c in range(grid):
            out.paste(img, (c * w, r * h))
    return out


def cmd_preview(args):
    from PIL import Image

    img = Image.open(args.image[0]).convert("RGB")
    _montage(img, args.grid).save(args.out)
    print(f"[preview] wrote {args.grid}x{args.grid} montage {args.out}")


# --------------------------------------------------------------------------- #
DESCRIPTION = """\
imagegen - a thin, general-purpose CLI over OpenAI's gpt-image-2 Image API.

Not tied to textures (or anything): you supply the prompts. Three API commands
(generate / edit / tile) plus a local-only preview helper.

  generate   text prompt -> image(s)
  edit       input image(s) [+ mask] + prompt -> image
  tile       make an image seamlessly tileable (roll 50% + inpaint the seam)
  pbr        albedo (generated or --image) -> UE5 PBR set (derived locally)
  glb        pack a PBR map set into a .glb (textured plane) to view in Babylon
  preview    local NxN montage to eyeball tiling (no API call)

Prompts are never hardcoded: pass --prompt "...", --prompt-file FILE, or
"--prompt -" to read stdin. Auth: OPENAI_API_KEY from env or a .env in cwd/parents.
Use --dry-run on any API command to print the request without spending a call."""

EXAMPLES = """\
examples:
  # text -> image
  imagegen generate --prompt "a red sphere on white" --size 1024x1024 -o sphere.png

  # 2 variants, high quality, from a prompt file
  imagegen generate --prompt-file p.txt -n 2 -q high -o sphere.png   # -> sphere_1.png, sphere_2.png

  # combine reference images
  imagegen edit -i a.png -i b.png --prompt "put a in the style of b" -o c.png

  # masked edit (transparent areas of mask = what gets repainted)
  imagegen edit -i room.png --mask hole.png --prompt "a flamingo in the pool" -o out.png

  # make a texture seamless, then verify by tiling 3x3
  imagegen tile -i tex.png --prompt-file p.txt --size 1024x1024 -o tex_seamless.png --check
  imagegen preview -i tex_seamless.png --grid 3 -o check.png

  # full UE5 PBR set from an existing albedo (-> mat_BaseColor.png, _Normal.png, ...)
  imagegen pbr -i tex_seamless.png -o mars/mat
  # ...or generate the albedo AND derive the maps in one shot
  imagegen pbr --prompt-file p.txt --size 1024x1024 -q high -o mars/mat

  # pack that PBR set into a viewable .glb (drag onto sandbox.babylonjs.com)
  imagegen glb --prefix mars/mat -o mars/mat.glb --repeat 3"""

GOTCHAS = """\
gotchas (read these):
  * Model is gpt-image-2 only, by design. No other models are selectable.
  * No true 4K. Max edge 3840, max 8,294,400 px total -> largest square is
    2880x2880. Generate there and upscale in post if you need 4096.
  * --size rules: both edges multiple of 16, aspect <= 3:1, total px in
    [655360, 8294400]. Invalid sizes are rejected before any API call.
  * Cost scales with size AND quality. Use -q low for drafts; high can be ~30x
    the tokens. Square is fastest. --dry-run spends nothing.
  * tile: pass the SAME prompt you generated with, or the inpainted seam won't
    match. Wider --seam (e.g. 0.18) heals stubborn seams; too wide repaints
    real detail. Masking is prompt-guided, not pixel-exact.
  * pbr: maps are DERIVED locally from the albedo (no extra API calls), so they
    stay aligned + as seamless as the albedo -> run `tile` BEFORE `pbr`. Height
    is a luminance proxy, not true depth; tune --normal-strength / --detail.
    Normal is DirectX (UE5); use --opengl if it reads inverted. In UE, mark only
    BaseColor as sRGB; Normal/Roughness/AO/Height/ORM must be linear.
  * --compression only applies to --format jpeg/webp (ignored for png).
  * background=transparent is NOT supported by gpt-image-2 (only opaque/auto).
  * edit with a --mask: mask must match the FIRST image's size and have an alpha
    channel; transparent = edit here. It applies only to the first -i image.
  * Output is always written from base64; -o's parent dirs are created for you.
  * Latency: complex/high-q prompts can take up to ~2 min. Text rendering and
    exact element placement remain weak spots."""

def build_parser():
    p = argparse.ArgumentParser(
        prog="imagegen",
        description=DESCRIPTION,
        epilog=EXAMPLES + "\n\n" + GOTCHAS,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = p.add_subparsers(dest="cmd", required=True, metavar="{generate,edit,tile,preview}")

    def add_prompt(sp):
        g = sp.add_argument_group("prompt (choose one)")
        g.add_argument("--prompt", help="prompt text, or '-' to read stdin")
        g.add_argument("--prompt-file", help="read prompt from this file")

    def add_output_opts(sp, with_format=True):
        sp.add_argument("-o", "--out", required=True, help="output path (n>1 appends _1,_2,...)")
        sp.add_argument("-n", type=int, default=1, help="number of images")
        sp.add_argument("-q", "--quality", default="auto",
                        choices=["low", "medium", "high", "auto"])
        sp.add_argument("--size", default="auto",
                        help="WxH (multiple of 16) or 'auto'. e.g. 1024x1024, 2880x2880")
        if with_format:
            sp.add_argument("--format", choices=["png", "jpeg", "webp"])
            sp.add_argument("--compression", type=int, help="0-100, jpeg/webp only")
            sp.add_argument("--background", choices=["opaque", "auto"])
            sp.add_argument("--moderation", choices=["auto", "low"])
        sp.add_argument("--dry-run", action="store_true", help="print request, don't call API")

    def subparser(name, help_, epilog):
        return sub.add_parser(
            name, help=help_, description=help_, epilog=epilog,
            formatter_class=argparse.RawDescriptionHelpFormatter,
        )

    g = subparser("generate", "text -> image",
                  "Largest square is 2880x2880. -q low for drafts, high for finals.\n"
                  "n>1 appends _1,_2,... to -o.")
    add_prompt(g)
    add_output_opts(g)
    g.set_defaults(func=cmd_generate)

    e = subparser("edit", "image(s) [+mask] + prompt -> image",
                  "Repeat -i to pass multiple references. --mask is optional: transparent\n"
                  "areas = repaint; it must match the FIRST image's size + have alpha.")
    add_prompt(e)
    e.add_argument("-i", "--image", action="append", required=True, help="input image (repeatable)")
    e.add_argument("--mask", help="mask PNG (transparent = edit here); applies to first image")
    add_output_opts(e)
    e.set_defaults(func=cmd_edit)

    t = subparser("tile", "make an image seamlessly tileable",
                  "Rolls the image 50% so seams meet in the center, then inpaints the seam\n"
                  "cross. Pass the SAME prompt used to generate the image. --size must be\n"
                  "valid for gpt-image-2 (input is resized to it). Bump --seam if seams persist.")
    add_prompt(t)
    t.add_argument("-i", "--image", action="append", required=True, help="input image")
    t.add_argument("--seam", type=float, default=0.12, help="seam band width as fraction (default 0.12)")
    t.add_argument("--size", default="auto", help="resize to WxH (must be valid for gpt-image-2)")
    t.add_argument("-q", "--quality", default="high", choices=["low", "medium", "high", "auto"])
    t.add_argument("-o", "--out", required=True)
    t.add_argument("--check", action="store_true", help="also write a 3x3 tiling montage")
    t.add_argument("--debug-mask", help="write the seam mask to this path")
    t.add_argument("--dry-run", action="store_true")
    t.set_defaults(func=cmd_tile)

    b = subparser("pbr", "albedo -> UE5 PBR map set (derived locally)",
                  "Generates an albedo (from a prompt) or uses --image, then derives Normal,\n"
                  "Roughness, AO, Height and a packed ORM (R:AO G:Rough B:Metallic). Outputs\n"
                  "<out>_BaseColor.png, _Normal.png, ... -o is a path prefix. Run `tile` first\n"
                  "for seamless maps. Maps are derived, not API-generated -> always aligned.")
    add_prompt(b)
    b.add_argument("-i", "--image", action="append", help="albedo image (else generate from prompt)")
    b.add_argument("-o", "--out", required=True, help="output path prefix (suffixes appended)")
    b.add_argument("--maps", default="basecolor,normal,roughness,ao,height,orm",
                   help="comma list: basecolor,normal,roughness,ao,height,orm")
    b.add_argument("--size", default="auto", help="generate/resize to WxH")
    b.add_argument("-q", "--quality", default="high", choices=["low", "medium", "high", "auto"])
    b.add_argument("--normal-strength", type=float, default=4.0)
    b.add_argument("--detail", type=float, default=0.0,
                   help="high-pass radius for height; >0 removes large-scale shading")
    b.add_argument("--rough-min", type=float, default=0.4)
    b.add_argument("--rough-max", type=float, default=0.9)
    b.add_argument("--invert-rough", action="store_true", help="bright albedo -> rougher")
    b.add_argument("--ao-radius", type=float, default=8.0)
    b.add_argument("--ao-strength", type=float, default=1.0)
    b.add_argument("--opengl", action="store_true", help="OpenGL normals (default DirectX/UE5)")
    b.add_argument("--dry-run", action="store_true")
    b.set_defaults(func=cmd_pbr)

    gl = subparser("glb", "pack a PBR set into a .glb plane for Babylon/glTF viewers",
                   "Auto-finds <prefix>_BaseColor/_Normal/_ORM (or _Roughness/_AO) and embeds them\n"
                   "in a self-contained .glb. Normal is flipped to OpenGL (+Y) for glTF; ORM maps\n"
                   "to occlusion(R)+metallicRoughness(G,B). --repeat sets UV tiling. No API call.")
    gl.add_argument("--prefix", required=True, help="PBR output prefix (the -o you gave `pbr`)")
    gl.add_argument("-o", "--out", required=True, help="output .glb path")
    gl.add_argument("--repeat", type=float, default=1.0, help="UV tiling repeats (default 1)")
    gl.add_argument("--displace", type=float, default=0.0,
                    help="real geometric relief: offset a subdivided plane by the height map "
                         "(try 0.12). 0 = flat plane (normal map only).")
    gl.add_argument("--displace-seg", type=int, default=256,
                    help="subdivisions per side when --displace > 0 (default 256)")
    gl.add_argument("--displace-blur", type=float, default=0.012,
                    help="smooth height before displacing, as fraction of width (default 0.012); "
                         "keeps macro shape, lets the normal map carry grain. 0 = no smoothing")
    gl.add_argument("--normal-scale", type=float, default=1.0,
                    help="amplify the normal map in the material (glTF normalTexture.scale)")
    gl.add_argument("--basecolor", help="override base color path")
    gl.add_argument("--normal", help="override normal map path")
    gl.add_argument("--orm", help="override ORM path")
    gl.set_defaults(func=cmd_glb)

    v = subparser("preview", "local NxN tiling montage (no API)",
                  "Pure-local: tiles the image into a grid so you can spot seams. No API call.")
    v.add_argument("-i", "--image", action="append", required=True)
    v.add_argument("--grid", type=int, default=3)
    v.add_argument("-o", "--out", required=True)
    v.set_defaults(func=cmd_preview)

    return p


def main():
    load_dotenv_key()
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
