"""Validate draft 0.3 records locally, including correction and provenance links.

This is an opt-in draft validator. The production build still emits schema 0.2.0.
Usage: python pipeline/validate_hdx_v03.py RECORD.json [RECORD.json ...]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]


def validators() -> dict[str, Draft202012Validator]:
    schemas = {
        name: json.loads((ROOT / f"schema/hdx_{name}.v0.3.json").read_text())
        for name in ("entry", "view")
    }
    registry = Registry()
    for schema in schemas.values():
        Draft202012Validator.check_schema(schema)
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
    return {
        name: Draft202012Validator(schema, registry=registry)
        for name, schema in schemas.items()
    }


def overlaps(a: dict, b: dict) -> bool:
    """Conservative overlap of artifact fields/rows; absent selectors mean whole file."""
    if a["artifact"] != b["artifact"]:
        return False
    for dimension in ("fields", "rows"):
        x = set(a.get("selector", {}).get(dimension, []))
        y = set(b.get("selector", {}).get(dimension, []))
        if x and y and x.isdisjoint(y):
            return False
    return True


def semantic_errors(record: dict) -> list[str]:
    """Check local links and distinct retained correction inputs after schema validation.

    External table bytes, actual retention and execution reproducibility require separate
    checks. A view's workflow IDs belong to its owning entry and are checked there.
    """
    if record["id"].startswith("view_"):
        return []
    workflow = record.get("hdx", {}).get("peptide_workflow")
    if workflow is None:
        return []
    errors = []
    artifacts = {item["id"] for item in record["artifacts"]}
    runs = {item["id"]: item for item in record["runs"]}
    if len(artifacts) != len(record["artifacts"]):
        errors.append("duplicate artifact IDs")
    if len(runs) != len(record["runs"]):
        errors.append("duplicate run IDs")

    def visit(value: object) -> None:
        if isinstance(value, dict):
            if "artifact" in value and value["artifact"] not in artifacts:
                errors.append(f"unknown artifact: {value['artifact']}")
            for key, child in value.items():
                if key in {"parameters", "search_parameters", "columns"}:
                    continue
                if key in {"runs", "identification_runs", "envelope_processing_runs", "validity_runs", "differential_runs", "projection_runs"}:
                    for run_id in child:
                        if run_id not in runs:
                            errors.append(f"unknown run: {run_id}")
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(workflow)
    for stage_name, stage in workflow.items():
        for run_id in stage["runs"]:
            if run_id in runs:
                run = runs[run_id]
                if not run["inputs"] or not run["outputs"]:
                    errors.append(f"{stage_name}: run {run_id} needs explicit inputs and outputs")

    calibration = workflow["calibration"]
    if calibration["status"] == "recorded":
        seen_ids, seen_runs, previous_outputs = set(), set(), []
        for correction in calibration["details"]["corrections"]:
            label = correction["id"]
            run_id = correction["run"]
            if label in seen_ids:
                errors.append(f"{label}: duplicate correction ID")
            if run_id in seen_runs:
                errors.append(f"{label}: each correction needs a separate run")
            seen_ids.add(label)
            seen_runs.add(run_id)
            output = correction["output_measurements"]
            if any(overlaps(output, previous) for previous in previous_outputs):
                errors.append(f"{label}: correction branches have overlapping outputs")
            previous_outputs.append(output)
            measurements = correction["measurements"]
            if "source" in measurements and measurements["source"] != output:
                errors.append(f"{label}: calibrated table source differs from correction output")
            for row in measurements.get("records", []):
                if row["correction_run"] != run_id:
                    errors.append(f"{label}: calibrated row refers to a different correction run")
            if run_id not in calibration["runs"] or run_id not in runs:
                errors.append(f"{label}: correction run must be declared in calibration.runs and entry.runs")
                continue
            run = runs[run_id]
            if not isinstance(run.get("parameters"), dict) or not run["parameters"]:
                errors.append(f"{label}: correction run needs declared parameters")
            elif run["parameters"] != correction["parameters"]:
                errors.append(f"{label}: workflow and run parameters differ")
            for input_ref in [correction["input_measurements"], correction["uncorrected_measurements"], *correction["controls"]]:
                if overlaps(input_ref, output):
                    errors.append(f"{label}: correction output overlaps a retained input or control")
            if correction["input_measurements"] not in run["inputs"]:
                errors.append(f"{label}: correction input selector missing from run.inputs")
            if output not in run["outputs"]:
                errors.append(f"{label}: correction output selector missing from run.outputs")
            for control in correction["controls"]:
                if control not in run["inputs"]:
                    errors.append(f"{label}: control selector missing from run.inputs")
    return errors


def validate_record(record: dict) -> list[str]:
    kind = "view" if str(record.get("id", "")).startswith("view_") else "entry"
    errors = [
        f"{'/'.join(map(str, error.absolute_path)) or '/'}: {error.message}"
        for error in validators()[kind].iter_errors(record)
    ]
    return errors if errors else semantic_errors(record)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("records", nargs="+", type=Path)
    args = parser.parse_args()
    failed = False
    for path in args.records:
        record = json.loads(path.read_text())
        errors = validate_record(record)
        if errors:
            failed = True
            print(f"{path}: invalid")
            for error in errors:
                print(f"  {error}")
        else:
            print(f"{path}: valid draft 0.3 record")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
