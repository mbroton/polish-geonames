"""Save validated snapshot state on the data branch. Used only by the opt-in workflow."""
import os
from pathlib import Path
import shutil
import subprocess


def git(*args, cwd=None, check=True):
    return subprocess.run(["git", *args], cwd=cwd, check=check, text=True, capture_output=True)


def main():
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise SystemExit("This command is restricted to the publishing workflow.")
    source = Path("public/data").resolve()
    folder = Path(os.environ["RUNNER_TEMP"]) / "geonames-state"
    existing = git("show-ref", "--verify", "refs/remotes/origin/data", check=False).returncode == 0
    git("worktree", "add", "--detach", str(folder), "origin/data" if existing else "HEAD")
    if not existing:
        git("switch", "--orphan", "data", cwd=folder)
    # Only generated state goes to this branch. Large downloadable files are
    # rebuilt for Pages and are never committed to the code or data branch.
    if (folder / "snapshots").exists():
        shutil.rmtree(folder / "snapshots")
    shutil.copytree(source / "snapshots", folder / "snapshots")
    shutil.copy2(source / "manifest.json", folder / "manifest.json")
    git("config", "user.name", "github-actions[bot]", cwd=folder)
    git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com", cwd=folder)
    git("add", "manifest.json", "snapshots", cwd=folder)
    if git("diff", "--cached", "--quiet", cwd=folder, check=False).returncode != 0:
        git("commit", "-m", "chore(data): record validated PRNG snapshot and source check", cwd=folder)
        git("push", "origin", "HEAD:refs/heads/data", cwd=folder)


if __name__ == "__main__":
    main()
