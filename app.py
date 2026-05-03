from pathlib import Path
import uuid

import json
from datetime import datetime

from flask import Flask, Response, jsonify, request
from flask_cors import CORS

import pandas as pd

from execution.ods_report import generate_report

app = Flask(__name__)
CORS(app, resources={r"/ods/*": {"origins": "*"}})

BASE_DIR = Path(__file__).resolve().parent
TMP_DIR = BASE_DIR / ".tmp"
TMP_DIR.mkdir(exist_ok=True)

# Ajuste aqui as colunas esperadas por aba (nomes serão normalizados)
EXPECTED_COLUMNS_BY_SHEET = {
    # "ABA1": ["COLUNA A", "COLUNA B"],
}
PREVIEW_ROWS = 0


def _sanitize_json(value):
    if isinstance(value, dict):
        return {k: _sanitize_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_json(v) for v in value]
    if pd.isna(value):
        return None
    return value


@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": "ods-backend-2026-02-03-v2",
    })


@app.post("/ods/upload")
def upload_ods():
    if "file" not in request.files:
        return jsonify({"error": "Missing file field 'file'."}), 400

    uploaded = request.files["file"]
    if not uploaded.filename.lower().endswith(".ods"):
        return jsonify({"error": "Only .ods files are supported."}), 400

    temp_name = f"{uuid.uuid4().hex}.ods"
    temp_path = TMP_DIR / temp_name
    uploaded.save(temp_path)

    try:
        report = generate_report(
            str(temp_path),
            expected_columns_by_sheet=EXPECTED_COLUMNS_BY_SHEET,
            preview_rows=PREVIEW_ROWS,
        )
        report = _sanitize_json(report)
        try:
            payload = json.dumps(report, ensure_ascii=False, allow_nan=False)
        except ValueError as exc:
            return jsonify({"error": f"JSON invalid after sanitize: {exc}"}), 500
        print("ODS report:", report)
        return Response(payload, status=200, mimetype="application/json")
    finally:
        if temp_path.exists():
            temp_path.unlink()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
