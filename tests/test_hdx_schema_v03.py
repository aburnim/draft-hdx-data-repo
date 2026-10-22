"""Scientific workflow contract tests using synthetic data, not experimental results."""

import copy
import json
from pathlib import Path
import sys
import unittest

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from validate_hdx_v03 import overlaps, validate_record, validators

STAGES = ["identification", "envelope_processing", "uptake", "controls", "calibration",
          "reproducibility", "validity", "differential", "projection", "structural_mapping"]


def unknown_workflow():
    return {stage: {"status": "not recorded", "reason": "Synthetic fixture: no source supplied.",
                    "runs": [], "sources": [], "details": None} for stage in STAGES}


def artifact(identifier):
    return {"id": identifier, "name": identifier + ".json", "level": "L1", "type": "other",
            "uri": "https://example.org/" + identifier, "sha256": None}


def base_entry():
    return {"schema_version": "0.3.0", "id": "hdx_00000000", "kind": "hdx", "state": "new",
            "revision": {"revision_number": 1, "parent_revision_id": None, "state": "pending"},
            "title": "Synthetic schema test", "method": "HDX-MS (peptide level)",
            "polymer_entities": [], "artifacts": [artifact("raw"), artifact("values"), artifact("controls")],
            "runs": [], "models": [], "view": "view_test", "extensions": ["hdx.peptide_workflow"],
            "hdx": {"peptide_map": {}, "peptide_workflow": unknown_workflow()}}


def calibration_entry():
    entry = base_entry()
    input_ref = {"artifact": "values", "selector": {"fields": ["uncorrected"]}}
    output_ref = {"artifact": "values", "selector": {"fields": ["corrected"]}}
    control_ref = {"artifact": "controls"}
    parameters = {"method": "synthetic scaling", "scale": 1.0}
    entry["runs"] = [{"id": "r_correct", "software_name": "synthetic test tool", "software_version": None,
                      "parameters": parameters, "inputs": [input_ref, control_ref], "outputs": [output_ref]}]
    correction = {"id": "c1", "run": "r_correct", "method": "other", "formula": "y = x",
                  "parameters": parameters, "input_measurements": input_ref,
                  "uncorrected_measurements": input_ref, "controls": [control_ref],
                  "output_measurements": output_ref, "preserves_inputs": True,
                  "missing_control_policy": "null", "zero_time_policy": "retain measured value",
                  "uncertainty_method": None, "limitations": "Synthetic fixture only.",
                  "measurements": {"records": []}}
    entry["hdx"]["peptide_workflow"]["calibration"] = {
        "status": "recorded", "reason": None, "runs": ["r_correct"], "sources": [input_ref],
        "details": {"corrections": [correction]}}
    return entry


class SchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = validators()["entry"].schema

    def valid_definition(self, name, value):
        validator = Draft202012Validator({"$schema": self.schema["$schema"], "$defs": self.schema["$defs"],
                                         "$ref": "#/$defs/" + name})
        return validator.is_valid(value)

    def test_both_schemas_are_valid(self):
        self.assertEqual(set(validators()), {"entry", "view"})

    def test_unknown_is_valid_but_not_silent(self):
        entry = base_entry()
        self.assertEqual(validate_record(entry), [])
        del entry["hdx"]["peptide_workflow"]["identification"]
        self.assertTrue(validate_record(entry))

    def test_peptide_entry_requires_workflow(self):
        entry = base_entry()
        del entry["hdx"]["peptide_workflow"]
        self.assertTrue(validate_record(entry))

    def test_peptide_method_cannot_bypass_workflow_by_omitting_map(self):
        entry = base_entry()
        del entry["hdx"]
        self.assertTrue(validate_record(entry))

    def test_nonpeptide_entries_do_not_require_peptide_workflow(self):
        entry = base_entry()
        entry["method"] = "X-RAY DIFFRACTION"
        del entry["hdx"]
        self.assertEqual(validate_record(entry), [])

    def test_missing_reason_for_absent_control_is_invalid(self):
        stage = unknown_workflow()["controls"]
        stage["status"] = "not performed"
        stage["reason"] = None
        self.assertFalse(self.valid_definition("controls_stage", stage))

    def test_recorded_identification_requires_software_threshold_status_and_curation(self):
        details = {"input_labeling": "undeuterated", "software": [{"name": "Example identifier", "version": None, "role": "identification"}],
                   "strategy": "Synthetic sequence search", "sequence_database": {"name": None, "version": None, "source": None},
                   "search_parameters": {"precursor_error_ppm": 30}, "acceptance_criteria": [],
                   "acceptance_criteria_status": "not recorded",
                   "curation": {"status": "not recorded", "method": None, "reviewer": None, "reviewed_at": None, "record": None},
                   "peptide_map": {"records": []}, "notes": "Synthetic fixture"}
        self.assertTrue(self.valid_definition("identification_details", details))
        for field in ("software", "acceptance_criteria_status", "curation", "peptide_map"):
            bad = copy.deepcopy(details)
            del bad[field]
            self.assertFalse(self.valid_definition("identification_details", bad), field)
        details["acceptance_criteria_status"] = "recorded"
        self.assertFalse(self.valid_definition("identification_details", details))

    def test_envelope_processing_requires_manual_validation_status(self):
        details = {"software": [{"name": "Example extractor", "version": None, "role": "envelope extraction"}],
                   "extraction_method": None, "uptake_method": None, "parameters": {}, "quality_criteria": [],
                   "quality_criteria_status": "not recorded", "envelopes": {"records": []}, "notes": None,
                   "manual_validation": {"status": "not recorded", "method": None, "reviewer": None, "reviewed_at": None, "record": None}}
        self.assertTrue(self.valid_definition("envelope_processing_details", details))
        del details["manual_validation"]
        self.assertFalse(self.valid_definition("envelope_processing_details", details))

    def test_peptide_evidence_flags_and_curation_decision_required(self):
        row = {"id": "p1", "polymer_entity": "pe1", "start": 1, "end": 4, "sequence": "AAAA",
               "evidence": [], "flags": [], "decision": "not recorded", "reason": None}
        self.assertTrue(self.valid_definition("peptide_row", row))
        del row["evidence"]
        self.assertFalse(self.valid_definition("peptide_row", row))

    def test_uptake_dimensions_and_missing_value_distinction(self):
        row = {"id": "u1", "peptide": "p1", "sample": "s1", "state": "apo", "replicate": "r1",
               "time_s": 10, "time_bin": None, "charges": [2, 3], "envelope_ids": ["e1", "e2"],
               "uptake_da": 0.0, "value_status": "reported", "reason": None}
        self.assertTrue(self.valid_definition("uptake_row", row))
        for dimension in ("state", "time_s", "replicate", "peptide", "charges", "envelope_ids"):
            bad = copy.deepcopy(row)
            del bad[dimension]
            self.assertFalse(self.valid_definition("uptake_row", bad), dimension)
        row["uptake_da"] = None
        self.assertFalse(self.valid_definition("uptake_row", row))
        row["value_status"] = "no value reported"
        self.assertTrue(self.valid_definition("uptake_row", row))

    def test_corrections_preserve_inputs_and_have_parameters(self):
        entry = calibration_entry()
        self.assertEqual(validate_record(entry), [])
        correction = entry["hdx"]["peptide_workflow"]["calibration"]["details"]["corrections"][0]
        correction["preserves_inputs"] = False
        self.assertTrue(validate_record(entry))
        correction["preserves_inputs"] = True
        correction["parameters"] = {}
        self.assertTrue(validate_record(entry))

    def test_same_file_distinct_fields_allowed_but_overwrite_rejected(self):
        entry = calibration_entry()
        correction = entry["hdx"]["peptide_workflow"]["calibration"]["details"]["corrections"][0]
        correction["output_measurements"] = correction["input_measurements"]
        entry["runs"][0]["outputs"] = [correction["output_measurements"]]
        self.assertTrue(any("overlaps" in error for error in validate_record(entry)))

    def test_parameter_mismatch_or_missing_run_output_rejected(self):
        entry = calibration_entry()
        entry["runs"][0]["parameters"] = {"method": "different"}
        self.assertTrue(any("parameters differ" in error for error in validate_record(entry)))
        entry = calibration_entry()
        entry["runs"][0]["outputs"] = []
        self.assertTrue(validate_record(entry))

    def test_multiple_corrections_cannot_reuse_run_or_output(self):
        entry = calibration_entry()
        corrections = entry["hdx"]["peptide_workflow"]["calibration"]["details"]["corrections"]
        corrections.append(copy.deepcopy(corrections[0]))
        errors = validate_record(entry)
        self.assertTrue(any("duplicate correction ID" in error for error in errors))
        self.assertTrue(any("separate run" in error for error in errors))
        self.assertTrue(any("overlapping outputs" in error for error in errors))

    def test_fd_and_reporter_corrections_require_control_links(self):
        for method in ("FD normalization", "internal exchange reporter"):
            entry = calibration_entry()
            correction = entry["hdx"]["peptide_workflow"]["calibration"]["details"]["corrections"][0]
            correction["method"] = method
            correction["controls"] = []
            self.assertTrue(validate_record(entry), method)

    def test_calibrated_row_cannot_claim_another_correction_run(self):
        entry = calibration_entry()
        correction = entry["hdx"]["peptide_workflow"]["calibration"]["details"]["corrections"][0]
        correction["measurements"] = {"records": [{"id": "c1", "input_observation": "u1", "peptide": "p1",
            "sample": "s1", "state": "apo", "replicate": "r1", "time_s": 10, "value": 1.0,
            "unit": "Da", "correction_run": "r_other", "control_ids": [], "reason": None}]}
        self.assertTrue(any("different correction run" in error for error in validate_record(entry)))

    def test_unknown_artifact_or_run_rejected(self):
        entry = calibration_entry()
        entry["artifacts"] = [artifact("values"), artifact("raw")]
        self.assertTrue(any("unknown artifact" in error for error in validate_record(entry)))
        entry = calibration_entry()
        entry["runs"] = []
        self.assertTrue(any("unknown run" in error for error in validate_record(entry)))

    def test_selector_overlap_is_conservative(self):
        self.assertTrue(overlaps({"artifact": "a"}, {"artifact": "a", "selector": {"fields": ["x"]}}))
        self.assertFalse(overlaps({"artifact": "a", "selector": {"rows": ["1"]}}, {"artifact": "a", "selector": {"rows": ["2"]}}))

    def test_reproducibility_is_l1_and_mapping_is_l3(self):
        repro = {"level": "L1", "replicate_type": "not recorded", "experimental_unit": None,
                 "grouping": None, "method": None, "input_measurements": {"artifact": "a"}, "summary": {"records": []}}
        self.assertTrue(self.valid_definition("reproducibility_details", repro))
        repro["level"] = "L2"
        self.assertFalse(self.valid_definition("reproducibility_details", repro))
        mapping = {"level": "L3", "purpose": "mapping to structural models", "method": "alignment",
                   "projection_runs": [], "mappings": {"records": []}, "limitations": None}
        self.assertTrue(self.valid_definition("structural_mapping_details", mapping))
        mapping["purpose"] = "agreement"
        self.assertFalse(self.valid_definition("structural_mapping_details", mapping))

    def test_l2_projection_does_not_require_a_structure(self):
        projection = {"analysis_status": "exploratory", "method": "overlapping peptides", "exchangeable_span": "declared positions",
                      "overlap_rule": "mixed on conflict", "weighting": None, "time_aggregation": None,
                      "differential_runs": ["r_diff"], "results": {"records": []}, "limitations": None}
        self.assertTrue(self.valid_definition("projection_details", projection))

    def test_external_tables_require_complete_column_mapping(self):
        self.assertFalse(self.valid_definition("uptake_table", {"source": {"artifact": "a"}}))

    def test_view_resolves_workflow_schema_without_network(self):
        view = {"schema_version": "0.3.0", "id": "view_test", "name": "Synthetic", "kind": "peptide",
                "members": [], "chain": {"id": "A", "positions": []}, "external_refs": {},
                "artifacts": [], "runs": [], "derivations": [], "peptide_workflow": unknown_workflow()}
        self.assertEqual(validate_record(view), [])
        del view["peptide_workflow"]
        self.assertTrue(validate_record(view))

    def test_existing_02_records_still_validate_against_02_schemas(self):
        for kind, directory in (("entry", "entries"), ("view", "views")):
            schema = json.loads((ROOT / f"schema/hdx_{kind}.v0.2.json").read_text())
            validator = Draft202012Validator(schema)
            records = sorted((ROOT / "web/public" / directory).glob("*.json"))
            self.assertTrue(records)
            for path in records:
                self.assertEqual(list(validator.iter_errors(json.loads(path.read_text()))), [], str(path))


if __name__ == "__main__":
    unittest.main()
