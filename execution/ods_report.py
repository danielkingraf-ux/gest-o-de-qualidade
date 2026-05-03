import json
from pathlib import Path
from typing import Dict, Any, List, Optional

import pandas as pd


def _normalize_columns(cols: List[str]) -> List[str]:
    return [str(c).strip().upper().replace(" ", "_") for c in cols]

def _sanitize_numbers(values: Dict[str, Any]) -> Dict[str, Any]:
    sanitized: Dict[str, Any] = {}
    for key, value in values.items():
        if pd.isna(value):
            sanitized[key] = None
        else:
            sanitized[key] = value
    return sanitized


def generate_report(
    file_path: str,
    expected_columns_by_sheet: Optional[Dict[str, List[str]]] = None,
    preview_rows: int = 0,
) -> Dict[str, Any]:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    sheets = pd.read_excel(path, sheet_name=None, engine="odf")
    sheet_reports: List[Dict[str, Any]] = []
    warnings: List[str] = []

    for sheet_name, df in sheets.items():
        df = df.copy()
        df.columns = _normalize_columns(df.columns.tolist())
        df = df.replace([pd.NA, pd.NaT], None)
        df = df.where(df.notna(), None)

        missing_cols: List[str] = []
        if expected_columns_by_sheet and sheet_name in expected_columns_by_sheet:
            expected = _normalize_columns(expected_columns_by_sheet[sheet_name])
            missing_cols = [c for c in expected if c not in df.columns]
            if missing_cols:
                warnings.append(
                    f"Aba '{sheet_name}' sem colunas esperadas: {missing_cols}"
                )

        numeric_means = (
            df.select_dtypes(include="number")
            .mean(numeric_only=True)
            .to_dict()
        )
        numeric_means = _sanitize_numbers(numeric_means)

        sheet_payload: Dict[str, Any] = {
            "sheet": sheet_name,
            "stats": {
                "rows": int(df.shape[0]),
                "columns": int(df.shape[1]),
                "numeric_means": numeric_means,
            },
            "missing_columns": missing_cols,
        }

        if preview_rows > 0:
            sheet_payload["data_preview"] = df.head(preview_rows).to_dict(orient="records")

        sheet_reports.append(sheet_payload)

    total_sheets = len(sheet_reports)
    total_rows = sum(s["stats"]["rows"] for s in sheet_reports)
    total_columns = sum(s["stats"]["columns"] for s in sheet_reports)

    return {
        "file": {
            "name": path.name,
            "size_bytes": path.stat().st_size,
        },
        "summary": {
            "total_sheets": total_sheets,
            "total_rows": total_rows,
            "total_columns": total_columns,
        },
        "sheets": sheet_reports,
        "warnings": warnings,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate ODS report")
    parser.add_argument("file", help="Path to .ods file")
    args = parser.parse_args()

    report = generate_report(args.file)
    print(json.dumps(report, ensure_ascii=False, indent=2))
