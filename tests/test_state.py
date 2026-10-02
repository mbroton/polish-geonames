import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/save_state.py"


class StateTests(unittest.TestCase):
    def test_publication_state_uses_only_data_branch_and_excludes_downloads(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            repo = root / "code"
            repo.mkdir()
            remote = root / "remote.git"
            env = {**os.environ, "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}

            def git(*args):
                return subprocess.run(["git", *args], cwd=repo, env=env, check=True,
                                      capture_output=True, text=True).stdout.strip()

            git("init", "--bare", str(remote))
            git("init", "-b", "main")
            git("config", "user.name", "Test")
            git("config", "user.email", "test@example.invalid")
            (repo / "README.md").write_text("Code branch must stay unchanged.\n")
            git("add", "README.md")
            git("commit", "-m", "test: initial code")
            original = git("rev-parse", "HEAD")
            git("remote", "add", "origin", str(remote))
            git("push", "origin", "main")
            data = repo / "public/data"
            snapshot = data / "snapshots/test-version"
            snapshot.mkdir(parents=True)
            (snapshot / "records.json.gz").write_bytes(b"fixed snapshot content")
            (data / "manifest.json").write_text(json.dumps({"version": "test-version", "last_checked": "first"}))
            (data / "downloads").mkdir()
            (data / "downloads/large.xlsx").write_bytes(b"must not be committed")

            for check in ["first", "second"]:
                (data / "manifest.json").write_text(json.dumps({"version": "test-version", "last_checked": check}))
                runner = root / check
                runner.mkdir()
                subprocess.run([sys.executable, str(SCRIPT)], cwd=repo,
                               env={**env, "GITHUB_ACTIONS": "true", "RUNNER_TEMP": str(runner)},
                               check=True, capture_output=True, text=True)
                git("fetch", "origin", "data:refs/remotes/origin/data")
                self.assertEqual(git("rev-parse", "HEAD"), original)
                self.assertEqual(git("ls-remote", "origin", "refs/heads/main").split()[0], original)
                self.assertEqual(git("ls-tree", "-r", "--name-only", "origin/data").splitlines(),
                                 ["manifest.json", "snapshots/test-version/records.json.gz"])
                self.assertEqual(json.loads(git("show", "origin/data:manifest.json"))["last_checked"], check)
                self.assertEqual(git("show", "origin/data:snapshots/test-version/records.json.gz"), "fixed snapshot content")


if __name__ == "__main__":
    unittest.main()
