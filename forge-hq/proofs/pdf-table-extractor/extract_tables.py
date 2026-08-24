#!/usr/bin/env python3
"""Batch PDF table extraction proof for ForgeHQ.

This intentionally does not use OCR. Image-only/scanned pages are flagged for review
rather than silently inventing data.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable, Sequence

import pdfplumber


LINE_SETTINGS = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
    "snap_tolerance": 3,
    "join_tolerance": 3,
    "intersection_tolerance": 3,
}

TEXT_SETTINGS = {
    "vertical_strategy": "text",
    "horizontal_strategy": "text",
    "min_words_vertical": 2,
    "min_words_horizontal": 1,
    "snap_tolerance": 3,
    "join_tolerance": 3,
}


@dataclass(frozen=True)
class TableResult:
    source_document: str
    page_number: int
    page_rotation: int
    table_index: int
    method: str
    row_count: int
    column_count: int
    output_file: str
    flags: tuple[str, ...]


def clean_cell(value: object) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\s+", " ", text).strip()


def clean_table(table: Sequence[Sequence[object]]) -> list[list[str]]:
    rows = [[clean_cell(cell) for cell in row] for row in table]
    while rows and not any(rows[-1]):
        rows.pop()
    return rows


def quality_flags(rows: Sequence[Sequence[str]]) -> tuple[str, ...]:
    flags: list[str] = []
    if not rows:
        return ("empty_table",)

    widths = [len(row) for row in rows]
    if len(set(widths)) > 1:
        flags.append("inconsistent_column_count")

    header = list(rows[0]) if rows else []
    if not header or any(not value for value in header):
        flags.append("empty_header_cell")

    normalized_headers = [value.casefold() for value in header if value]
    if len(normalized_headers) != len(set(normalized_headers)):
        flags.append("duplicate_header_name")

    if len(rows) < 2:
        flags.append("single_row_table")

    all_cells = [cell for row in rows for cell in row]
    if all_cells:
        nonempty_ratio = sum(bool(cell) for cell in all_cells) / len(all_cells)
        if nonempty_ratio < 0.55:
            flags.append("sparse_table")

    return tuple(flags)


def write_matrix_csv(path: Path, rows: Sequence[Sequence[str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerows(rows)


def write_long_csv(path: Path, rows: Iterable[dict[str, object]]) -> None:
    fieldnames = [
        "source_document",
        "page_number",
        "page_rotation",
        "table_index",
        "row_index",
        "column_index",
        "value",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def extract_page_tables(page) -> tuple[str, list[list[list[object]]]]:
    tables = page.extract_tables(LINE_SETTINGS) or []
    if tables:
        return "lines", tables

    tables = page.extract_tables(TEXT_SETTINGS) or []
    if tables:
        return "text", tables

    return "none", []


def extract_pdf(pdf_path: Path, output_dir: Path) -> tuple[list[TableResult], list[dict[str, object]], list[dict[str, object]]]:
    table_results: list[TableResult] = []
    long_rows: list[dict[str, object]] = []
    page_flags: list[dict[str, object]] = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            method, raw_tables = extract_page_tables(page)
            page_text = clean_cell(page.extract_text() or "")

            if not raw_tables:
                page_flags.append(
                    {
                        "source_document": pdf_path.name,
                        "page_number": page_number,
                        "flag": "possible_scanned_page" if len(page_text) < 20 else "no_table_detected",
                    }
                )
                continue

            for table_index, raw_table in enumerate(raw_tables, start=1):
                rows = clean_table(raw_table)
                flags = quality_flags(rows)
                max_width = max((len(row) for row in rows), default=0)
                normalized_rows = [row + [""] * (max_width - len(row)) for row in rows]

                table_file = output_dir / "tables" / f"{pdf_path.stem}__p{page_number:03d}__t{table_index:02d}.csv"
                write_matrix_csv(table_file, normalized_rows)

                rotation = int(getattr(page, "rotation", 0) or 0)
                result = TableResult(
                    source_document=pdf_path.name,
                    page_number=page_number,
                    page_rotation=rotation,
                    table_index=table_index,
                    method=method,
                    row_count=len(normalized_rows),
                    column_count=max_width,
                    output_file=str(table_file.relative_to(output_dir)),
                    flags=flags,
                )
                table_results.append(result)

                for row_index, row in enumerate(normalized_rows, start=1):
                    for column_index, value in enumerate(row, start=1):
                        long_rows.append(
                            {
                                "source_document": pdf_path.name,
                                "page_number": page_number,
                                "page_rotation": rotation,
                                "table_index": table_index,
                                "row_index": row_index,
                                "column_index": column_index,
                                "value": value,
                            }
                        )

    per_pdf_file = output_dir / f"{pdf_path.stem}.csv"
    write_long_csv(per_pdf_file, long_rows)
    return table_results, long_rows, page_flags


def collect_pdfs(inputs: Sequence[str]) -> list[Path]:
    found: dict[str, Path] = {}
    for raw in inputs:
        path = Path(raw).expanduser().resolve()
        if path.is_dir():
            for pdf in path.rglob("*.pdf"):
                found[str(pdf)] = pdf
        elif path.is_file() and path.suffix.casefold() == ".pdf":
            found[str(path)] = path
    return sorted(found.values())


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract PDF tables into traceable UTF-8 CSV files.")
    parser.add_argument("inputs", nargs="+", help="PDF files and/or directories")
    parser.add_argument("--output", default="output", help="Output directory")
    parser.add_argument("--master", action="store_true", help="Write master.csv across all PDFs")
    args = parser.parse_args()

    pdfs = collect_pdfs(args.inputs)
    if not pdfs:
        parser.error("No PDF files found in the supplied inputs.")

    output_dir = Path(args.output).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    all_results: list[TableResult] = []
    all_long_rows: list[dict[str, object]] = []
    all_page_flags: list[dict[str, object]] = []

    for pdf_path in pdfs:
        results, long_rows, page_flags = extract_pdf(pdf_path, output_dir)
        all_results.extend(results)
        all_long_rows.extend(long_rows)
        all_page_flags.extend(page_flags)

    manifest = {
        "documents": len(pdfs),
        "tables": len(all_results),
        "flagged_tables": sum(bool(result.flags) for result in all_results),
        "page_flags": len(all_page_flags),
        "results": [{**asdict(result), "flags": list(result.flags)} for result in all_results],
        "unmatched_pages": all_page_flags,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    if args.master:
        write_long_csv(output_dir / "master.csv", all_long_rows)

    print(json.dumps({key: manifest[key] for key in ("documents", "tables", "flagged_tables", "page_flags")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
