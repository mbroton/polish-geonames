import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

from parser import parse_data
from scripts.build_data import content_hash, prepare, validate_snapshot

FIXTURE = Path(__file__).parent / "fixtures/localities.xml"


class ParserTests(unittest.TestCase):
    def test_id_comes_from_source_and_survives_added_sort_predecessor(self):
        source = FIXTURE.read_text()
        village = parse_data(io.StringIO(source))[0]
        self.assertEqual(village["id"], 76566)
        self.assertEqual(village["locality_code"], "0244340")
        self.assertEqual(village["commune"], "Końskie")
        all_places = parse_data(io.StringIO(source), all_localities=True)
        self.assertEqual([(r["name"], r["id"]) for r in all_places], [("Boguszowice", 7791), ("Małachów", 76566)])

    def test_full_export_preserves_repeated_and_nested_fields(self):
        rows = parse_data(FIXTURE, all_localities=True)
        self.assertEqual(rows[0]["parent_code"], "0942765")
        self.assertEqual(rows[0]["type"], "część miasta")
        self.assertEqual(rows[1]["alternate_names"], ["Test alternate one", "Test alternate two"])
        self.assertEqual(rows[1]["references"], [{"title": "Test source", "date": "2026-01-01", "publisher": "GUGiK"}])
        self.assertEqual(rows[1]["lat"], 51.224092182361815)
        self.assertEqual(rows[1]["lng"], 20.2920359676266)

    def test_invalid_source_fails_instead_of_assigning_an_id(self):
        source = FIXTURE.read_text()
        for value in ("", "bad", "0", "-1"):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "ID|field: id"):
                parse_data(io.StringIO(source.replace(">76566<", f">{value}<")))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            parse_data(io.StringIO(source.replace(">7791<", ">76566<")), all_localities=True)

    def test_invalid_coordinates_and_new_fields_fail_validation(self):
        source = FIXTURE.read_text()
        for invalid in ("nan 20", "51 inf", "20 51", "0 0", "51"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                parse_data(io.StringIO(source.replace("51.224092182361815 20.2920359676266", invalid)))
        with self.assertRaisesRegex(ValueError, "unknown source field"):
            parse_data(io.StringIO(source.replace("<p:nazwaOboczna>", "<p:unknown>").replace("</p:nazwaOboczna>", "</p:unknown>")))

    def test_cli_does_not_renumber_the_sorted_output(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "places.json"
            subprocess.run([sys.executable, "-B", "parser.py", str(FIXTURE), str(output), "--all"], check=True, capture_output=True)
            rows = json.loads(output.read_text())
            self.assertEqual([r["id"] for r in rows], [7791, 76566])

    def test_small_source_is_not_publishable(self):
        with self.assertRaisesRegex(ValueError, "incomplete"):
            validate_snapshot(parse_data(FIXTURE, all_localities=True))

    def test_main_point_is_selected_without_losing_secondary_points(self):
        source = FIXTURE.read_text()
        secondary = """<p:reprezentacjaObiektu>
          <p:rodzajReprezent>punkt dodatkowy</p:rodzajReprezent>
          <p:wojewodztwo>świętokrzyskie</p:wojewodztwo>
          <p:wspolrzedneGeograficzne>51.2 20.3</p:wspolrzedneGeograficzne>
        </p:reprezentacjaObiektu>"""
        source = source.replace("<p:reprezentacjaObiektu>", secondary + "<p:reprezentacjaObiektu>", 1)
        village = parse_data(io.StringIO(source))[0]
        self.assertEqual(village["lat"], 51.224092182361815)
        self.assertEqual(village["commune_code"], "2605033")
        self.assertEqual(len(village["representations"]), 2)
        self.assertEqual(village["representations"][0]["lat"], 51.2)

    def test_cli_tsv_preserves_text_instead_of_spreadsheet_formulas(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "source.xml"
            source.write_text(FIXTURE.read_text().replace("Małachów", "=1+1"))
            output = Path(folder) / "places.tsv"
            subprocess.run([sys.executable, "-B", "parser.py", str(source), str(output)], check=True, capture_output=True)
            self.assertIn("76566\t'=1+1\tvillage", output.read_text())

    def test_snapshot_retention_keeps_recent_changed_content_only(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "source.zip"
            output = Path(folder) / "data"
            versions = []
            for day in [1, 2, 3]:
                with zipfile.ZipFile(source, "w") as archive:
                    archive.writestr("PRNG_MIEJSCOWOSCI_GML.xml", FIXTURE.read_text().replace("Małachów", f"Test {day}"))
                result = prepare(source, output, source_date=f"2026-10-0{day}", production=False, keep_snapshots=2)
                versions.append(result["version"])
            self.assertEqual([item["version"] for item in result["history"]], list(reversed(versions[1:])))
            self.assertFalse((output / "snapshots" / versions[0]).exists())
            self.assertTrue((output / "snapshots" / versions[1] / "records.json.gz").exists())
            result = prepare(source, output, source_date="2026-10-04", production=False, keep_snapshots=1)
            self.assertEqual([item["version"] for item in result["history"]], [versions[2]])
            self.assertFalse((output / "snapshots" / versions[1]).exists())

    def test_record_order_does_not_change_snapshot_hash(self):
        records = parse_data(FIXTURE, all_localities=True)
        self.assertEqual(content_hash(records), content_hash(list(reversed(records))))
        records[0]["name"] = "A changed source name"
        self.assertNotEqual(content_hash(records), content_hash(parse_data(FIXTURE, all_localities=True)))

    def test_unchanged_snapshot_keeps_version_and_records_new_check(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "source.zip"
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("PRNG_MIEJSCOWOSCI_GML.xml", FIXTURE.read_bytes())
                archive.writestr("Export danych PRNG z dnia 2026-09-30", "2026-09-30")
            output = Path(folder) / "data"
            first = prepare(source, output, production=False)
            second = prepare(source, output, source_date="2026-10-01", production=False)
            self.assertEqual(first["version"], second["version"])
            self.assertEqual(second["source_export"], "2026-09-30")
            self.assertEqual(second["upstream_export"], "2026-10-01")
            self.assertEqual(len(second["history"]), 1)
            with self.assertRaisesRegex(ValueError, "older"):
                prepare(source, output, source_date="2026-09-30", production=False)
            source.write_bytes(b"broken archive")
            with self.assertRaises(zipfile.BadZipFile):
                prepare(source, output, production=False)
            self.assertEqual(json.loads((output / "manifest.json").read_text()), second)


if __name__ == "__main__":
    unittest.main()
