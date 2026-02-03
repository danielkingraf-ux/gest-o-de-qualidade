import json
from pathlib import Path
from typing import Dict, Any, List

import pandas as pd


def _sheet_stats(df: pd.DataFrame) -> Dict[str, Any]:
    numeric_df = df.select_dtypes(include="number")
    non_null_counts = df.count().to_dict()
    means = numeric_df.mean(numeric_only=True).to_dict()
    return {
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "non_null_counts": non_null_counts,
        "numeric_means": means,
    }


def generate_report(file_path: str) -> Dict[str, Any]:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    sheets = pd.read_excel(path, sheet_name=None, engine="odf")
    sheet_reports: List[Dict[str, Any]] = []

    for sheet_name, df in sheets.items():
        stats = _sheet_stats(df)
        sheet_reports.append({
            "sheet": sheet_name,
            "stats": stats,
        })

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
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate ODS report")
    parser.add_argument("file", help="Path to .ods file")
    args = parser.parse_args()

    report = generate_report(args.file)
    print(json.dumps(report, ensure_ascii=False, indent=2))
