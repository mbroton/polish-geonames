"""Convert the official PRNG locality export into records with source IDs."""

import argparse
import csv
import json
import math
import re
import sys
import xml.etree.ElementTree as ET

PREFIX = "{urn:gugik:specyfikacje:gmlas:panstwowyRejestrNazwGeograficznych:1.0}"
RECORD_TAG = f"{PREFIX}NG_NazwaGeograficznaRP"
BASIC_FIELDS = ["id", "name", "type", "province", "district", "commune", "lat", "lng"]
CORE_FIELDS = BASIC_FIELDS + ["status", "commune_code"]
SCALAR_FIELDS = {
    "identyfikatorPRNG": "id", "nazwaGlowna": "name",
    "rodzajObiektu": "type", "statusNazwy": "status", "idiip": "iip_id",
    "identyfikatorZewnetrzny": "locality_code",
    "nazwaMiejscowosciNadrzednej": "parent_name",
    "identyfikatorMiejscowosciNadrzednej": "parent_code",
    "elementRozrozniajacy": "distinguishing_name",
    "elementRodzajowy": "generic_term", "kategoriaObiektu": "category",
    "wersjaObiektu": "source_version", "poczatekWersjiObiektu": "version_start",
    "koniecWersjiObiektu": "version_end", "waznaOd": "valid_from",
    "waznaDo": "valid_to", "dopelniacz": "genitive",
    "przymiotnik": "adjective", "informacjeDodatkowe": "notes",
}
LIST_FIELDS = {
    "nazwaOboczna": "alternate_names", "nazwaHistoryczna": "historical_names",
    "nazwaDodatkowa": "additional_names", "endonim": "endonyms",
    "egzonim": "exonyms", "zrodloInformacji": "references",
}
REPRESENTATION_FIELDS = {
    "rodzajReprezent": "point_type", "identyfikatorGminy": "commune_code",
    "gmina": "commune", "powiat": "district", "wojewodztwo": "province",
    "wspolrzedneGeograficzne": "coordinates", "wspolrzedneXY": "projected_coordinates",
}
NESTED_FIELDS = {
    "nazwa": "name", "jezyk": "language", "latynizacja": "romanization",
    "tytul": "title", "data": "date", "wydawca": "publisher",
}


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def parse_coordinates(value):
    try:
        lat, lng = (float(number) for number in value.split())
    except (ValueError, AttributeError) as error:
        raise ValueError(f"expected two numeric coordinates, got {value!r}") from error
    if not (math.isfinite(lat) and math.isfinite(lng) and 49 <= lat <= 55 and 14 <= lng <= 24.2):
        raise ValueError(f"coordinates outside Poland's bounding box: {value!r}")
    return lat, lng


def read_element(element):
    record = {}
    representations = []
    for child in element:
        name = local_name(child.tag)
        value = child.text.strip() if child.text and child.text.strip() else None
        if name in SCALAR_FIELDS:
            record[SCALAR_FIELDS[name]] = value
        elif name in LIST_FIELDS:
            if len(child):
                value = {NESTED_FIELDS[local_name(c.tag)]: c.text for c in child}
            record.setdefault(LIST_FIELDS[name], []).append(value)
        elif name == "reprezentacjaObiektu":
            representation = {REPRESENTATION_FIELDS[local_name(c.tag)]: c.text for c in child}
            lat, lng = parse_coordinates(representation.pop("coordinates", None))
            representation.update(lat=lat, lng=lng)
            representations.append(representation)
        elif name != "geometriaObiektu":
            raise ValueError(f"unknown source field: {name}")

    for field in ("id", "name", "type", "status"):
        if not record.get(field):
            raise ValueError(f"missing required field: {field}")
    raw_id = record["id"]
    if not raw_id.isascii() or not raw_id.isdecimal() or int(raw_id) <= 0:
        raise ValueError(f"invalid PRNG ID: {raw_id!r}")
    record["id"] = int(raw_id)
    # These two values retain the existing export's vocabulary.
    record["type"] = {"miasto": "city", "wieś": "village"}.get(record["type"], record["type"])
    if not representations:
        raise ValueError("missing locality coordinates")
    primary = next((r for r in representations if r["point_type"] == "punkt główny"), representations[0])
    for field in ("province", "district", "commune", "commune_code", "lat", "lng"):
        record[field] = primary.get(field)
    if record["commune"]:
        record["commune"] = record["commune"].split("-gmina")[0]
    record["representations"] = representations
    return record


def parse_data(source_file, all_localities=False):
    records = []
    ids = set()
    # Clear featureMember wrappers as well as records to bound XML memory use.
    for _, element in ET.iterparse(source_file, events=("end",)):
        if element.tag != RECORD_TAG:
            if local_name(element.tag) in ("featureMember", "member"):
                element.clear()
            continue
        kind = element.findtext(f"{PREFIX}rodzajObiektu")
        if not all_localities and kind not in ("miasto", "wieś"):
            element.clear()
            continue
        try:
            record = read_element(element)
            if record["id"] in ids:
                raise ValueError(f"duplicate PRNG ID: {record['id']}")
            ids.add(record["id"])
        except (ValueError, KeyError) as error:
            name = element.findtext(f"{PREFIX}nazwaGlowna", "<unnamed>")
            raise ValueError(f"invalid record {name!r}: {error}") from error
        records.append(record)
        element.clear()
    if not records:
        raise ValueError("no locality records found; expected a PRNG GML export")
    return sorted(records, key=lambda r: (r["name"], r["id"]))


def tabular_value(value):
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, str) and re.match(r"\s*[=+@-]", value):
        return "'" + value
    return value


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("source")
    args.add_argument("output")
    args.add_argument("--all", action="store_true", help="include all locality types and source fields")
    options = args.parse_args()
    extension = options.output.rsplit(".", 1)[-1]
    if extension not in ("json", "tsv"):
        args.error("output must have a .json or .tsv extension")
    try:
        records = parse_data(options.source, all_localities=options.all)
        fields = sorted({key for row in records for key in row}) if options.all else BASIC_FIELDS
        with open(options.output, "w", encoding="utf-8", newline="") as file:
            rows = [{key: row.get(key) for key in fields} for row in records]
            if extension == "json":
                json.dump(rows, file, ensure_ascii=False, allow_nan=False)
            else:
                writer = csv.DictWriter(file, fieldnames=fields, delimiter="\t")
                writer.writeheader()
                for row in rows:
                    writer.writerow({k: tabular_value(v) for k, v in row.items()})
        print(f"Saved {len(records):,} localities to {options.output}.")
        return 0
    except (OSError, ET.ParseError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
