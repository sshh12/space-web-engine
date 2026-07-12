# foolrate-score.py — score panel judgments against the held-out key (R4).
# fool = the judge picked the RENDER as "the photograph". Controls are
# real-vs-real: their "fool rate" is the judge-noise baseline (~0.5 for a
# fair judge). Gates use the Wilson 95% lower bound, reported per band.
# Usage: python bench/foolrate-score.py bench/out/foolrate/judgments.json
import json, math, sys, os

ROOT = os.path.dirname(os.path.abspath(__file__))
key = {k["file"]: k for k in json.load(open(os.path.join(ROOT, "out", "foolrate", "key.json")))}
judgments = json.load(open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out", "foolrate", "judgments.json")))

def wilson_low(p, n, z=1.96):
    if n == 0: return 0.0
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    return max(0.0, (c - z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d)

bands = {}
for j in judgments:
    k = key.get(j["file"])
    if not k: continue
    grp = ("CONTROL:" if k["control"] else "") + k["band"]
    fooled = j["choice"] != k["real"]   # picked the non-photo slot
    b = bands.setdefault(grp, [0, 0])
    b[0] += fooled; b[1] += 1

print(f"{'band':28s} {'fooled':>7s} {'n':>4s} {'rate':>6s} {'wilson95lo':>10s}")
for grp in sorted(bands):
    f, n = bands[grp]
    p = f / n
    print(f"{grp:28s} {f:7d} {n:4d} {p:6.2f} {wilson_low(p, n):10.2f}")
print("\nnote: preliminary run — gate criterion is n>=100 per body x band;")
print("report fool rates RELATIVE to the CONTROL baseline (judge noise).")
