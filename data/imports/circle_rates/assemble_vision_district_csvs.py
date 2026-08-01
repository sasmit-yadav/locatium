"""Assemble any _extract_<district>_*.py vision files into circle_rates CSVs."""
from __future__ import annotations

import argparse
import csv
import importlib.util
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SQYD_PER_ACRE = 4840
EFFECTIVE = "2026-04-01"
BISWA_TO_SQYD = 45.0
BIGHA_TO_SQYD = 225.0
MARLA_TO_SQYD = 30.25
SQM_TO_SQYD = 1.19599

# district slug -> (Official Name, {tehsil_slug: Title})
DISTRICTS: dict[str, tuple[str, dict[str, str]]] = {
    "sonipat": (
        "Sonipat",
        {
            "ganaur": "Ganaur",
            "gohana": "Gohana",
            "khanpur": "Khanpur",
            "kharkhoda": "Kharkhoda",
            "rai": "Rai",
            "sonipat": "Sonipat",
        },
    ),
    "rewari": (
        "Rewari",
        {"bawal": "Bawal", "kosli": "Kosli", "rewari": "Rewari"},
    ),
    "rohtak": (
        "Rohtak",
        {
            "kalanaur": "Kalanaur",
            "lakhanmajra": "Lakhan Majra",
            "meham": "Meham",
            "rohtak": "Rohtak",
            "sampla": "Sampla",
        },
    ),
    "palwal": (
        "Palwal",
        {
            "bahin": "Bahin",
            "hassanpur": "Hassanpur",
            "hathin": "Hathin",
            "hodal": "Hodal",
            "omaxecity": "Omaxe City",
            "palwal": "Palwal",
        },
    ),
    "panipat": (
        "Panipat",
        {
            "bapoli": "Bapoli",
            "israna": "Israna",
            "madlauda": "Madlauda",
            "panipat": "Panipat",
            "samalkha": "Samalkha",
        },
    ),
    "nuh": (
        "Nuh",
        {
            "ferozepurjhirka": "Ferozepur Jhirka",
            "nagina": "Nagina",
            "nuh": "Nuh",
            "punhana": "Punhana",
            "tauru": "Tauru",
        },
    ),
    "karnal": (
        "Karnal",
        {
            "assandh": "Assandh",
            "ballah": "Ballah",
            "gharaunda": "Gharaunda",
            "indri": "Indri",
            "karnal": "Karnal",
            "nigdhu": "Nigdhu",
            "nilokheri": "Nilokheri",
            "nissing": "Nissing",
        },
    ),
    "bhiwani": (
        "Bhiwani",
        {
            "bawanikhera": "Bawani Khera",
            "behal": "Behal",
            "bhiwani": "Bhiwani",
            "loharu": "Loharu",
            "siwani": "Siwani",
            "tosham": "Tosham",
        },
    ),
    "charkhidadri": ("Charkhi Dadri", {"badhra": "Badhra", "baundkalan": "Baund Kalan", "dadri": "Dadri"}),
    "hisar": (
        "Hisar",
        {
            "adampur": "Adampur",
            "balsamand": "Balsamand",
            "barwala": "Barwala",
            "bass": "Bass",
            "hansi": "Hansi",
            "hisar": "Hisar",
            "kherijalab": "Kheri Jalab",
            "narnaund": "Narnaund",
            "uklana": "Uklana",
        },
    ),
    "mahendragarh": (
        "Mahendragarh",
        {
            "ateli": "Ateli",
            "kanina": "Kanina",
            "mahendragarh": "Mahendragarh",
            "nangalchoudhary": "Nangal Choudhary",
            "narnaul": "Narnaul",
            "satnali": "Satnali",
        },
    ),
    "jind": (
        "Jind",
        {
            "alewa": "Alewa",
            "jind": "Jind",
            "julana": "Julana",
            "narwana": "Narwana",
            "pillukhera": "Pillukhera",
            "safidon": "Safidon",
            "uchana": "Uchana",
        },
    ),
    "kaithal": (
        "Kaithal",
        {
            "subtehsildhand": "Dhand",
            "subtehsilrajaund": "Rajaund",
            "subtehsilsiwan": "Siwan",
            "tehsilguhla": "Guhla",
            "tehsilkaithal": "Kaithal",
            "tehsilkalayat": "Kalayat",
            "tehsilpundri": "Pundri",
        },
    ),
    "ambala": (
        "Ambala",
        {
            "ambala": "Ambala",
            "ambalacantt": "Ambala Cantt",
            "mullana": "Mullana",
            "naraingarh": "Naraingarh",
            "saha": "Saha",
            "shahzadpur": "Shahzadpur",
            # barara: wrong PDF (registry details) — skip until predictive rates PDF obtained
        },
    ),
    "kurukshetra": (
        "Kurukshetra",
        {
            "babain": "Babain",
            "ismailabad": "Ismailabad",
            "ladwa": "Ladwa",
            "pehowa": "Pehowa",
            "shahbad": "Shahbad",
        },
    ),
    "sirsa": (
        "Sirsa",
        {
            "dabwali": "Dabwali",
            "ellenabad": "Ellenabad",
            "goriwala": "Goriwala",
            "kalanwali": "Kalanwali",
            "nathusarichopta": "Nathusari Chopta",
            "rania": "Rania",
            "sirsa": "Sirsa",
        },
    ),
    "yamunanagar": (
        "Yamunanagar",
        {
            "bilaspur": "Bilaspur",
            "chhachhrauli": "Chhachhrauli",
            "jagadhri": "Jagadhri",
            "partapnagar": "Partap Nagar",
            "radaur": "Radaur",
            "sadhaura": "Sadhaura",
            "saraswatinagar": "Saraswati Nagar",
        },
    ),
}


def load_rows(path: Path) -> list:
    spec = importlib.util.spec_from_file_location(path.stem, path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return list(mod.ROWS)


def to_sqyd(rate, unit: str):
    u = (unit or "").lower().strip()
    if u == "acre":
        return round(float(rate) / SQYD_PER_ACRE, 2)
    if u == "biswa":
        return round(float(rate) / BISWA_TO_SQYD, 2)
    if u == "bigha":
        return round(float(rate) / BIGHA_TO_SQYD, 2)
    if u == "marla":
        return round(float(rate) / MARLA_TO_SQYD, 2)
    if u in ("sqm", "sq.m", "sqmeter", "sqmetre"):
        return round(float(rate) / SQM_TO_SQYD, 2)
    val = float(rate)
    return int(val) if val == int(val) else val


def title_case_tehsil(slug: str) -> str:
    return re.sub(r"([a-z])([A-Z])", r"\1 \2", slug).replace("_", " ").title()


def write_csv(district: str, tehsil: str, source: str, rows: list, out_name: str) -> int:
    path = ROOT / out_name
    seen = set()
    n = 0
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "district",
                "tehsil",
                "village",
                "segment",
                "sector_type",
                "rate_per_sq_yard_inr",
                "effective_from",
                "source",
            ]
        )
        for row in rows:
            if not isinstance(row, (tuple, list)) or len(row) != 5:
                continue
            village, segment, sector_type, rate, unit = row
            if rate is None or float(rate) == 0:
                continue
            key = (village, segment, sector_type, rate, unit)
            if key in seen:
                continue
            seen.add(key)
            w.writerow(
                [
                    district,
                    tehsil,
                    str(village).replace(" ", ""),
                    str(segment).strip(),
                    sector_type,
                    to_sqyd(rate, unit),
                    EFFECTIVE,
                    source,
                ]
            )
            n += 1
    print(f"{out_name}: {n} rows")
    return n


def assemble_district(slug: str) -> None:
    if slug not in DISTRICTS:
        raise SystemExit(f"Unknown district slug: {slug}")
    official, tehsil_titles = DISTRICTS[slug]
    source = f"{official.lower().replace(' ', '')}_gov_in_dc_notification"
    files = sorted(ROOT.glob(f"_extract_{slug}_*.py"))
    if not files:
        raise SystemExit(f"No extracts for {slug}")

    # Group by tehsil: _extract_<district>_<tehsil>[_pXX_pYY].py
    groups: dict[str, list[Path]] = {}
    prefix = f"_extract_{slug}_"
    for f in files:
        rest = f.stem[len(prefix) :]
        # strip page range suffixes
        tehsil = re.sub(r"_p\d+_p\d+$", "", rest)
        tehsil = re.sub(r"_p\d+_end$", "", tehsil)
        tehsil = re.sub(r"_all$", "", tehsil)
        groups.setdefault(tehsil, []).append(f)

    for tehsil_slug, paths in sorted(groups.items()):
        rows = []
        for p in paths:
            rows.extend(load_rows(p))
        title = tehsil_titles.get(tehsil_slug) or title_case_tehsil(tehsil_slug)
        write_csv(
            official,
            title,
            source,
            rows,
            f"circle_rates_{slug}_{tehsil_slug}_v1.csv",
        )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--district", help="slug e.g. sonipat")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if args.all:
        for slug in DISTRICTS:
            files = list(ROOT.glob(f"_extract_{slug}_*.py"))
            if files:
                print(f"\n=== assemble {slug} ===")
                assemble_district(slug)
    elif args.district:
        assemble_district(args.district.lower())
    else:
        raise SystemExit("Pass --district <slug> or --all")


if __name__ == "__main__":
    main()
