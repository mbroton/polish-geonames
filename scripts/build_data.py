"""Fetch PRNG and prepare a validated, versioned snapshot for the static site."""

import argparse
from collections import Counter
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import urllib.request
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parser import BASIC_FIELDS, CORE_FIELDS, parse_data

SOURCE_URL = "https://opendata.geoportal.gov.pl/prng/PRNG_MIEJSCOWOSCI_GML.zip"
ATTRIBUTION = "Data: GUGiK, Państwowy Rejestr Nazw Geograficznych (PRNG), CC BY 4.0. Converted by Polish geonames."
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def content_hash(records):
    return hashlib.sha256(encode(sorted(records, key=lambda row: row["id"]))).hexdigest()


def validate_snapshot(records, previous_count=None):
    types = Counter(row["type"] for row in records)
    if len(records) < 100_000 or types["city"] < 800 or types["village"] < 40_000:
        raise ValueError("source is incomplete: expected the full Polish locality register")
    if len({row["province"] for row in records if row.get("province")}) != 16:
        raise ValueError("source must cover all 16 provinces")
    if previous_count and len(records) < previous_count * 0.95:
        raise ValueError("source lost more than 5% of records; review this change before publication")


def write_gzip(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(encode(value), mtime=0))


def save_manifest(output, manifest, keep_snapshots):
    manifest["history"] = manifest["history"][:keep_snapshots]
    manifest["snapshot_limit"] = keep_snapshots
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    retained = {item["version"] for item in manifest["history"]}
    for folder in (output / "snapshots").iterdir():
        if folder.is_dir() and folder.name not in retained:
            shutil.rmtree(folder)


def prepare(source, output, source_date=None, production=True, keep_snapshots=30):
    if keep_snapshots < 1:
        raise ValueError("keep_snapshots must be at least 1")
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / "manifest.json"
    previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    archive = zipfile.ZipFile(source)
    names = archive.namelist()
    if source_date is None:
        dates = {match.group(0) for name in names if "Export danych PRNG" in name
                 for match in re.finditer(r"\d{4}-\d{2}-\d{2}", name)}
        if len(dates) != 1:
            raise ValueError("cannot determine the source export date from the archive")
        source_date = dates.pop()
    datetime.strptime(source_date, "%Y-%m-%d")
    if previous.get("upstream_export", previous.get("source_export", "")) > source_date:
        raise ValueError("the upstream export is older than the last validated export")
    xml_files = [name for name in names if name.endswith("PRNG_MIEJSCOWOSCI_GML.xml")]
    if len(xml_files) != 1:
        raise ValueError("expected one PRNG locality GML file")
    with archive, archive.open(xml_files[0]) as stream:
        records = parse_data(stream, all_localities=True)
    # The order of repeated source references and names has no export meaning.
    for row in records:
        for key, value in row.items():
            if isinstance(value, list):
                row[key] = sorted(value, key=lambda item: encode(item))
    if production:
        validate_snapshot(records, previous.get("count"))
    digest = content_hash(records)
    checked = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if previous.get("content_hash") == digest:
        previous.update(last_checked=checked, upstream_export=source_date)
        save_manifest(output, previous, keep_snapshots)
        print("No record changes. Updated the successful check time.")
        return previous

    version = f"{source_date}-{digest[:12]}"
    snapshot = output / "snapshots" / version
    all_fields = BASIC_FIELDS + sorted({key for row in records for key in row} - set(BASIC_FIELDS))
    write_gzip(snapshot / "records.json.gz", records)
    write_gzip(snapshot / "index.json.gz", [{k: row.get(k) for k in CORE_FIELDS} for row in records])
    manifest = {
        "schema_version": 2, "version": version, "content_hash": digest,
        "source_export": source_date, "upstream_export": source_date, "last_checked": checked,
        "source_url": SOURCE_URL, "license": LICENSE_URL, "attribution": ATTRIBUTION,
        "count": len(records), "fields": all_fields, "core_fields": CORE_FIELDS,
        "types": dict(sorted(Counter(row["type"] for row in records).items())),
        "index": f"snapshots/{version}/index.json.gz",
        "records": f"snapshots/{version}/records.json.gz",
        "index_bytes": (snapshot / "index.json.gz").stat().st_size,
        "records_bytes": (snapshot / "records.json.gz").stat().st_size,
        "previous_version": previous.get("version"),
    }
    history = previous.get("history", [])
    manifest["history"] = ([{"version": version, "source_export": source_date, "count": len(records),
                             "records": manifest["records"]}] + history)[:keep_snapshots]
    manifest["snapshot_limit"] = keep_snapshots
    (snapshot / "metadata.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    save_manifest(output, manifest, keep_snapshots)
    print(f"Prepared {len(records):,} localities. Snapshot: {version}.")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="use an existing official ZIP export")
    parser.add_argument("--output", type=Path, default=Path("public/data"))
    parser.add_argument("--keep-snapshots", type=int, default=30)
    options = parser.parse_args()
    source = options.source
    if source is None:
        source = Path(".cache/PRNG_MIEJSCOWOSCI_GML.zip")
        source.parent.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "polish-geonames/2 (github.com/mbroton/polish-geonames)"})
        with urllib.request.urlopen(request, timeout=120) as response, source.open("wb") as file:
            while chunk := response.read(1024 * 1024):
                file.write(chunk)
    if options.keep_snapshots < 1:
        parser.error("--keep-snapshots must be at least 1")
    prepare(source, options.output, keep_snapshots=options.keep_snapshots)


if __name__ == "__main__":
    main()
