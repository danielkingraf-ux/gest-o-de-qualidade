from pathlib import Path
import uuid

from flask import Flask, jsonify, request

from execution.ods_report import generate_report

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
TMP_DIR = BASE_DIR / ".tmp"
TMP_DIR.mkdir(exist_ok=True)


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
        report = generate_report(str(temp_path))
        return jsonify(report), 200
    finally:
        if temp_path.exists():
            temp_path.unlink()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
