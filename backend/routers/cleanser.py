from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import APIRouter, File, HTTPException, UploadFile

from cleanser_agent import run_cleanser

router = APIRouter()


@router.post("/run")
async def run_cleanser_endpoint(
    harmonization_csv: UploadFile = File(...),
    validation_report_json: UploadFile | None = File(None),
):
    if not harmonization_csv.filename:
        raise HTTPException(status_code=400, detail="harmonization_csv is required")

    with TemporaryDirectory(prefix="sap_cleanser_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        input_csv_path = tmp_path / "harmonization.csv"
        validation_json_path = tmp_path / "validation_report.json"
        output_csv_path = tmp_path / "cleaned.csv"

        input_csv_path.write_bytes(await harmonization_csv.read())

        report_path: Path | None = None
        if validation_report_json and validation_report_json.filename:
            validation_json_path.write_bytes(await validation_report_json.read())
            report_path = validation_json_path

        try:
            summary = run_cleanser(
                dataset_csv_path=input_csv_path,
                validation_report_json_path=report_path,
                output_csv_path=output_csv_path,
            )
            cleaned_csv = output_csv_path.read_text(encoding="utf-8")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Cleanser failed: {exc}") from exc

    return {
        "success": True,
        "summary": summary,
        "cleaned_csv": cleaned_csv,
    }
