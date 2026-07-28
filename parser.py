import csv
import json
import sys
import xml.etree.ElementTree as ET
from typing import Callable

_PREFIX = (
    "{urn:gugik:specyfikacje:gmlas:panstwowyRejestrNazwGeograficznych:1.0}"
)
_RECORD_TAG = f"{_PREFIX}NG_NazwaGeograficznaRP"
_TRANSLATIONS = {
    "nazwaGlowna": "name",
    "rodzajObiektu": "type",
    "wojewodztwo": "province",
    "powiat": "district",
    "gmina": "commune",
    "wspolrzedneGeograficzne": "coords",
}
FIELDS_TRANSLATION = {f"{_PREFIX}{k}": v for k, v in _TRANSLATIONS.items()}
_REQUIRED_FIELDS = {"name", "type", "province", "district", "commune", "coords"}


def parse_type(value: str) -> str:
    return "city" if value == "miasto" else "village"


def parse_commune(value: str) -> str:
    return value.split("-gmina")[0]


def parse_coordinates(value: str) -> list[float]:
    try:
        lat, lng = (float(number) for number in value.split())
    except ValueError as error:
        raise ValueError(f"expected two numeric values, got {value!r}") from error

    if not -90 <= lat <= 90 or not -180 <= lng <= 180:
        raise ValueError(f"coordinates out of range: {value!r}")

    return [lat, lng]


FIELD_VALUE_PARSER = {
    "type": parse_type,
    "commune": parse_commune,
    "coords": parse_coordinates,
}


def read_element(element: ET.Element) -> dict:
    """Read and translate the fields of one PRNG geographical-name record."""
    member_data: dict = {"id": None}
    for child in element.iter():
        if child.tag in FIELDS_TRANSLATION:
            member_data[FIELDS_TRANSLATION[child.tag]] = child.text
    return member_data


def validate_data(data: dict) -> None:
    missing = sorted(field for field in _REQUIRED_FIELDS if not data.get(field))
    if missing:
        raise ValueError(f"missing required fields: {', '.join(missing)}")


def transform_values(data: dict) -> dict:
    """Transform values as defined in FIELD_VALUE_PARSER."""
    new_data = {}
    for key, value in data.items():
        if key in FIELD_VALUE_PARSER:
            value = FIELD_VALUE_PARSER[key](value)
        new_data[key] = value
    return new_data


def save_as_json(data: list[dict], output_file: str) -> None:
    with open(output_file, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False)


def save_as_tsv(data: list[dict], output_file: str) -> None:
    header = data[0].keys()
    with open(output_file, "w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=header, delimiter="\t")
        writer.writeheader()
        writer.writerows(data)


_EXT_TO_FUNC: dict[str, Callable[[list[dict], str], None]] = {
    "json": save_as_json,
    "tsv": save_as_tsv,
}


def parse_data(source_file: str) -> list[dict]:
    """Parse cities and villages from a PRNG GML file without loading its XML tree."""
    parsed_data = []
    for _, element in ET.iterparse(source_file, events=("end",)):
        if element.tag != _RECORD_TAG:
            continue

        element_data = read_element(element)
        if element_data.get("type") not in ("wieś", "miasto"):
            element.clear()
            continue

        try:
            validate_data(element_data)
            new = transform_values(element_data)
        except ValueError as error:
            name = element_data.get("name", "<unnamed>")
            raise ValueError(f"invalid record {name!r}: {error}") from error

        new["lat"], new["lng"] = new.pop("coords")
        parsed_data.append(new)
        element.clear()

    if not parsed_data:
        raise ValueError("no city or village records found; check that this is a PRNG GML file")

    return parsed_data


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python3 parser.py [XML source file] [output file json or tsv]")
        return 1

    source_file = sys.argv[1]
    output_file = sys.argv[2]
    output_ext = output_file.split(".")[-1]
    if output_ext not in _EXT_TO_FUNC:
        print("Output file has to have json or tsv extension.")
        return 1

    print(f"Parsing {source_file!r}.")
    try:
        parsed_data = parse_data(source_file)
    except (OSError, ET.ParseError, ValueError) as error:
        print(f"Could not parse {source_file!r}: {error}", file=sys.stderr)
        return 1

    print(f"Parsing finished. {len(parsed_data)} elements loaded.")
    print("Sorting")
    parsed_data.sort(key=lambda place: place["name"])
    for index, place in enumerate(parsed_data, start=1):
        place["id"] = index

    print(f"Saving to {output_file!r}.")
    _EXT_TO_FUNC[output_ext](parsed_data, output_file)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
