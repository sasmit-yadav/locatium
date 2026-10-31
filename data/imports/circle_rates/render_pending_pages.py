"""Render pending district PDFs to page PNGs for vision extraction.
Continues on per-PDF errors (e.g. Poppler xref failures).
"""
from __future__ import annotations

import os
from pathlib import Path

from pdf2image import convert_from_path
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parent
PDFS = ROOT / "pdfs"
POPPLER = os.environ.get(
    "POPPLER_PATH",
    r"C:\Users\91798.SASMITPC\AppData\Local\Microsoft\WinGet\Packages\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\poppler-25.07.0\Library\bin",
)

PENDING = [
    "sonipat",
    "rewari",
    "rohtak",
    "palwal",
    "panipat",
    "nuh",
    "karnal",
    "hisar",
    "bhiwani",
    "charkhidadri",
    "mahendragarh",
    "jind",
    "kaithal",
    "ambala",
    "kurukshetra",
    "sirsa",
    "yamunanagar",
]


def repair_pdf(src: Path) -> Path | None:
    """Rewrite PDF via pypdf when Poppler chokes on xref."""
    fixed = src.with_name(src.stem + "_fixed.pdf")
    if fixed.exists() and fixed.stat().st_size > 10_000:
        return fixed
    try:
        reader = PdfReader(str(src))
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        with fixed.open("wb") as f:
            writer.write(f)
        print(f"  repaired -> {fixed.name}")
        return fixed
    except Exception as e:
        print(f"  repair failed {src.name}: {e}")
        return None


def render_pdf(pdf: Path, out: Path) -> int:
    try:
        n = len(PdfReader(str(pdf)).pages)
    except Exception as e:
        print(f"  BAD read {pdf.name}: {e}")
        return 0

    print(f"  {pdf.name}: {n} pages -> {out.relative_to(PDFS)}")
    try:
        for start in range(1, n + 1, 5):
            end = min(start + 4, n)
            if all((out / f"p{i:02d}.png").exists() for i in range(start, end + 1)):
                continue
            images = convert_from_path(
                str(pdf),
                dpi=180,
                poppler_path=POPPLER,
                first_page=start,
                last_page=end,
            )
            for i, img in enumerate(images):
                fp = out / f"p{start + i:02d}.png"
                if not fp.exists():
                    img.save(fp, "PNG")
        return n
    except Exception as e:
        print(f"  BAD render {pdf.name}: {e}")
        fixed = repair_pdf(pdf)
        if not fixed:
            return 0
        try:
            n = len(PdfReader(str(fixed)).pages)
            for start in range(1, n + 1, 5):
                end = min(start + 4, n)
                if all((out / f"p{i:02d}.png").exists() for i in range(start, end + 1)):
                    continue
                images = convert_from_path(
                    str(fixed),
                    dpi=180,
                    poppler_path=POPPLER,
                    first_page=start,
                    last_page=end,
                )
                for i, img in enumerate(images):
                    fp = out / f"p{start + i:02d}.png"
                    if not fp.exists():
                        img.save(fp, "PNG")
            return n
        except Exception as e2:
            print(f"  BAD render fixed {fixed.name}: {e2}")
            return 0


def render_district(slug: str) -> int:
    d = PDFS / slug
    if not d.exists():
        print(f"SKIP missing {slug}")
        return 0
    pages_total = 0
    print(f"\n=== {slug} ===")
    for pdf in sorted(d.glob("*.pdf")):
        low = pdf.name.lower()
        if "public_notice" in low or low.endswith(".pptx") or low.endswith("_fixed.pdf"):
            continue
        tehsil = "".join(c for c in pdf.stem.lower().replace(" ", "") if c.isalnum())[:40] or "doc"
        out = d / "pages" / tehsil
        out.mkdir(parents=True, exist_ok=True)
        pages_total += render_pdf(pdf, out)
    return pages_total


def main() -> None:
    grand = 0
    for slug in PENDING:
        grand += render_district(slug)
    print("\nTOTAL pages rendered/available:", grand)


if __name__ == "__main__":
    main()
