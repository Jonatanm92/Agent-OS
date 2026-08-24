# PDF Table Extractor — capability proof

Purpose: prove that ForgeHQ can take a bounded buyer requirement, turn it into an acceptance-testable implementation and produce traceable output **without claiming prior paid client experience**.

This proof is based on a current buyer requirement for batch multi-page PDF table extraction to UTF-8 CSV with page/document traceability and malformed-table flags.

## What it does

- accepts one or more PDFs and/or directories
- scans PDFs recursively when a directory is supplied
- extracts bordered tables first and falls back to text-alignment extraction
- normalizes whitespace while retaining cell values
- writes a matrix CSV for every detected table
- writes one traceable long-form CSV per source PDF
- optionally writes a master CSV across all PDFs
- records document, page, rotation, table, row and column coordinates
- flags suspicious table shape/header/sparsity issues
- flags pages where no table is detected
- marks low-text pages as possible scanned/image-only pages rather than fabricating content
- never performs OCR in this proof

## Setup

```powershell
cd forge-hq\proofs\pdf-table-extractor
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Test

```powershell
pytest -q
```

The deterministic smoke test generates its own two-page PDF with known tables, extracts it and verifies traceability plus known cell values.

## Run

Single directory, one CSV per PDF plus individual table files:

```powershell
python extract_tables.py C:\path\to\pdfs --output .\output
```

Include a cross-document master CSV:

```powershell
python extract_tables.py C:\path\to\pdfs --output .\output --master
```

## Output

```text
output/
  report-a.csv
  report-b.csv
  master.csv                 # only with --master
  manifest.json
  tables/
    report-a__p001__t01.csv
    report-a__p003__t01.csv
    report-b__p002__t01.csv
```

`manifest.json` records every extracted table, the extraction method, dimensions, output path and quality flags. Pages with no detected table are listed separately.

## Acceptance status

**Engineering proof: READY FOR LOCAL TESTING.**

**Buyer-specific 98% accuracy claim: NOT PROVEN.** That metric can only be measured against the buyer's actual supplied PDFs and a ground-truth comparison. ForgeHQ must never turn the synthetic smoke test into a claim about unknown client documents.

Before any delivery, run the buyer PDFs, compare extracted rows to ground truth, investigate every flagged table/page and record the measured accuracy. If the material is image-only/scanned, handle that as a separately approved OCR requirement rather than silently changing scope.
