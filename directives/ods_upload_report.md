# ODS Upload Report (Directive)

## Goal
Accept an uploaded ODS spreadsheet, compute per-sheet statistics (means and counts), and return a structured JSON report.

## Inputs
- Uploaded file (ODS) from the HTTP request field: `file`
- Temporary storage directory: `.tmp/`

## Tools / Scripts
- Orchestration layer: Flask endpoint (app.py)
- Execution layer: `execution/ods_report.py`

## Outputs
- JSON object with:
  - file metadata
  - per-sheet stats (row/column counts, non-null counts, numeric means)
  - overall summary

## Edge Cases
- Empty file or no sheets
- Sheets with no numeric columns
- Non-ODS input (return 400)

## Notes
- The orchestration layer must only coordinate: validate input, save file, call execution script, return JSON.
- The execution layer must be deterministic and side-effect free (besides reading the file).
