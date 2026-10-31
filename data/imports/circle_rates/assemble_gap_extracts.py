"""Assemble Fatehabad + Ambala Barara vision extracts into circle_rates CSVs."""
from __future__ import annotations

import csv
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent

EXTRACTS = [
    ("_extract_fatehabad_p01_10.py", "Fatehabad", "2025-04-01", "fatehabad_gov_in_dc_notification"),
    ("_extract_fatehabad_p11_20.py", "Fatehabad", "2025-04-01", "fatehabad_gov_in_dc_notification"),
    ("_extract_fatehabad_p21_29.py", "Fatehabad", "2025-04-01", "fatehabad_gov_in_dc_notification"),
    ("_extract_fatehabad_bhuna.py", "Fatehabad", "2023-04-01", "fatehabad_gov_in_dc_notification"),
    ("_extract_fatehabad_tohana.py", "Fatehabad", "2023-04-01", "fatehabad_gov_in_dc_notification"),
    ("_extract_fatehabad_ratia.py", "Fatehabad", "2023-04-01", "fatehabad_gov_in_dc_notification"),
    ("_extract_fatehabad_jakhal.py", "Fatehabad", "2023-04-01", "fatehabad_gov_in_dc_notification"),
    ("_extract_fatehabad_kullan.py", "Fatehabad", "2023-04-01", "fatehabad_gov_in_dc_notification"),
    ("_extract_fatehabad_bhattukalan.py", "Fatehabad", "2023-04-01", "fatehabad_gov_in_dc_notification"),
    ("_extract_ambala_barara.py", "Ambala", "2023-04-01", "ambala_gov_in_dc_notification"),
]


def load_rows(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return list(mod.ROWS)


def main():
    by_key: dict[tuple[str, str], list[dict]] = {}
    for fname, district, effective, source in EXTRACTS:
        path = ROOT / fname
        if not path.exists():
            raise SystemExit(f"Missing {path}")
        for tehsil, village, segment, sector, rate in load_rows(path):
            rate_n = float(rate)
            if rate_n <= 0:
                continue
            key = (district, str(tehsil).strip())
            by_key.setdefault(key, []).append(
                {
                    "district": district,
                    "tehsil": str(tehsil).strip(),
                    "village": str(village).replace(" ", ""),
                    "segment": " ".join(str(segment).split()),
                    "sector_type": str(sector).strip().lower(),
                    "rate_per_sq_yard_inr": rate_n if rate_n != int(rate_n) else int(rate_n),
                    "effective_from": effective,
                    "source": source,
                }
            )

    header = [
        "district",
        "tehsil",
        "village",
        "segment",
        "sector_type",
        "rate_per_sq_yard_inr",
        "effective_from",
        "source",
    ]
    written = []
    for (district, tehsil), rows in sorted(by_key.items()):
        slug_d = district.lower().replace(" ", "")
        slug_t = tehsil.lower().replace(" ", "").replace("-", "")
        out = ROOT / f"circle_rates_{slug_d}_{slug_t}_v1.csv"
        with out.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=header)
            w.writeheader()
            w.writerows(rows)
        written.append((out.name, len(rows)))
        print(f"Wrote {out.name}: {len(rows)} rows")
    print(f"Total files: {len(written)}")


if __name__ == "__main__":
    main()
