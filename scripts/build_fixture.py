"""Build a small, fixed PRNG snapshot for offline CI and browser tests."""
from pathlib import Path
import tempfile
import zipfile

from build_data import prepare

with tempfile.TemporaryDirectory() as folder:
    source = Path(folder) / "source.zip"
    with zipfile.ZipFile(source, "w") as archive:
        archive.writestr("PRNG_MIEJSCOWOSCI_GML.xml", Path("tests/fixtures/localities.xml").read_bytes())
        archive.writestr("Export danych PRNG z dnia 2026-09-30", "2026-09-30")
    prepare(source, "public/data", production=False)
