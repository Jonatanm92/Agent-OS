from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import PageBreak, SimpleDocTemplate, Table, TableStyle

from extract_tables import clean_cell, extract_pdf, quality_flags


def _build_pdf(path: Path) -> None:
    doc = SimpleDocTemplate(str(path), pagesize=A4)
    style = TableStyle(
        [
            ("GRID", (0, 0), (-1, -1), 1, colors.black),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]
    )

    first = Table(
        [
            ["Name", "Date", "Amount"],
            ["Alice", "2026-08-24", "125"],
            ["Bob", "2026-08-25", "240"],
        ]
    )
    first.setStyle(style)

    second = Table(
        [
            ["Product", "Qty"],
            ["Widget A", "3"],
            ["Widget B", "8"],
        ]
    )
    second.setStyle(style)

    doc.build([first, PageBreak(), second])


def test_clean_cell_normalizes_multiline_whitespace():
    assert clean_cell("  Multi\n line\t header  ") == "Multi line header"


def test_quality_flags_detects_bad_header_and_shape():
    rows = [["", "Amount"], ["A", "1", "extra"]]
    flags = quality_flags(rows)
    assert "empty_header_cell" in flags
    assert "inconsistent_column_count" in flags


def test_two_page_grid_pdf_extracts_traceable_tables(tmp_path):
    source = tmp_path / "sample.pdf"
    output = tmp_path / "out"
    _build_pdf(source)

    results, long_rows, page_flags = extract_pdf(source, output)

    assert len(results) >= 2
    assert not page_flags
    assert any(row["value"] == "Alice" and row["page_number"] == 1 for row in long_rows)
    assert any(row["value"] == "Widget B" and row["page_number"] == 2 for row in long_rows)
    assert (output / "sample.csv").exists()
    assert all((output / result.output_file).exists() for result in results)
