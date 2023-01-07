import csv
import json
import sys
import xml.etree.ElementTree as ET

_PREFIX = "{urn:gugik:specyfikacje:gmlas:panstwowyRejestrNazwGeograficznych:1.0}"
_TRANSLATIONS = {
    "nazwaGlowna": "name",
    "rodzajObiektu": "type",
    "wojewodztwo": "province",
    "powiat": "district",
    "gmina": "commune",
    "wspolrzedneGeograficzne": "coords",
}

FIELDS_TRANSLATION = {f"{_PREFIX}{k}": v for k, v in _TRANSLATIONS.items()}
FIELD_VALUE_PARSER = {
    "type": lambda t: "city" if t == "miasto" else "village",
    "commune": lambda c: c.split("-gmina")[0],
    "coords": lambda c: [float(n) for n in c.split(" ")],
}


def read_element(element: ET.Element) -> dict:
    """Read element data and translate fields names from polish"""
    member_data = {}
    for e in element.iter():
        if e.tag in list(FIELDS_TRANSLATION):
            tag_name = FIELDS_TRANSLATION[e.tag]
            member_data[tag_name] = e.text
    return member_data


def transform_values(data: dict) -> dict:
    """Transforms values of elements"""
    new_data = {}
    for k, v in data.items():
        if k in FIELD_VALUE_PARSER:
            v = FIELD_VALUE_PARSER[k](v)
        new_data[k] = v
    return new_data


def save_as_json(data: dict, output_file: str) -> None:
    with open(output_file, "w") as f:
        json.dump(data, f, ensure_ascii=False)


def save_as_tsv(data: dict, output_file: str) -> None:
    header = data[0].keys()
    with open(output_file, "w") as f:
        writer = csv.DictWriter(f, fieldnames=header, delimiter="\t")
        writer.writeheader()
        writer.writerows(data)


_EXT_TO_FUNC = {
    "json": save_as_json,
    "tsv": save_as_tsv,
}


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python3 parser.py [XML source file] [output file json or tsv]")
        return 1

    source_file = sys.argv[1]
    output_file = sys.argv[2]
    output_ext = output_file.split(".")[-1]
    if output_ext not in ("json", "tsv"):
        print("Output file has to have json or tsv extension.")
        return 1

    print(f"Parsing {source_file!r}.")
    root = ET.parse(source_file).getroot()

    parsed_data = []
    for element in root:
        element_data = read_element(element)

        # Data source contains a lot of different types of places.
        # This allows to parse only "village" and "city" types.
        if element_data["type"] not in ("wieś", "miasto"):
            continue

        new = transform_values(element_data)

        # Transform 'coords' to two fields 'lat' and 'lng'
        new["lat"], new["lng"] = new["coords"]
        del new["coords"]

        parsed_data.append(new)

    print(f"Parsing finished. {len(parsed_data)} elements loaded.")
    print(f"Saving to {output_file!r}.")
    _EXT_TO_FUNC[output_ext](parsed_data, output_file)
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
