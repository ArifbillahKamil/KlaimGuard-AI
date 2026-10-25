"""Read-only publication checks. Never print credential values."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GIT = ["git", "-c", f"safe.directory={ROOT.as_posix()}"]


def git(*args: str) -> bytes:
    return subprocess.check_output(GIT + list(args), cwd=ROOT)


RULES = {
    "private-key": rb"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----",
    "aws-access-key": rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
    "github-token": rb"\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{40,255})\b",
    "slack-token": rb"\bxox[baprs]-[A-Za-z0-9-]{20,}\b",
    "api-secret": rb"\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{32,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|npm_[A-Za-z0-9]{36})\b",
    "jwt": rb"\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b",
    "literal-credential": rb"(?i)\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|password|authorization)\s*[=:]\s*[\"'](?:Bearer )?[A-Za-z0-9_+/=-]{20,}[\"']",
    "url-credential": rb"https?://[^\s/:@]+:[^\s/@]+@",
}


def findings(content: bytes) -> list[str]:
    return [name for name, rule in RULES.items() if re.search(rule, content)]


def main() -> None:
    paths = sorted(set(git("ls-files", "-co", "--exclude-standard", "-z").decode("utf-8").strip("\0").split("\0")))
    problems = []
    for name in paths:
        path = ROOT / name
        if not path.is_file():
            continue
        parts = Path(name).parts
        if (any(p in ("node_modules", ".venv", "venv", "qa-results", ".aws", ".ssh", ".vercel") or p.startswith(".env") for p in parts)
                or name.startswith(("ml/artifacts/", "web/dist/"))):
            problems.append(f"Excluded generated/credential path included: {name}")
        content = path.read_bytes()
        if path.suffix.lower() != ".png":
            problems.extend(f"{name}: pattern {rule}" for rule in findings(content))
        if path.suffix in (".md", ".json") and re.search(rb"[A-Za-z]:[\\/]+Users[\\/]", content):
            problems.append(f"Workstation path in publication document: {name}")
    # Check concrete nested examples without creating any credential file.
    ignored = ["ml/artifacts/model.bin", "qa-results/run.json", "web/qa-results/run.json", "web/node_modules/a/index.js",
               "ml/.venv/pyvenv.cfg", "web/dist/index.html", ".env", ".env.local", "web/.env.production"]
    for name in ignored:
        result = subprocess.run(GIT + ["check-ignore", "-q", "--", name], cwd=ROOT)
        if result.returncode != 0:
            problems.append(f"Ignore rule missing: {name}")
    # Every historical Git blob is inspected, including no-longer-tracked files.
    objects = [line.split(b" ", 1)[0].decode("ascii") for line in git("rev-list", "--objects", "--all").splitlines()]
    inventory = git("cat-file", "--batch-all-objects", "--batch-check=%(objectname) %(objecttype)").decode("ascii").splitlines()
    reachable = set(objects)
    blobs = [line.split()[0] for line in inventory if line.endswith(" blob") and line.split()[0] in reachable]
    for oid in blobs:
        content = git("cat-file", "blob", oid)
        if content.startswith(b"\x89PNG"):
            continue
        problems.extend(f"Git blob {oid[:12]}: pattern {rule}" for rule in findings(content))
    local_config = git("config", "--local", "--list")
    problems.extend(f"Local Git config: pattern {rule}" for rule in findings(local_config))
    # Dashboard data must be byte-identical to the approved Gate C checkpoint.
    data_hashes, raw_hashes = {}, {}
    for path in sorted((ROOT / "web/public/data").glob("*.json")):
        relative = path.relative_to(ROOT).as_posix()
        expected_bytes = git("show", f"9b7fe6c:{relative}")
        actual_bytes = path.read_bytes()
        # Git core.autocrlf may change the checkout newline without changing JSON.
        expected = hashlib.sha256(expected_bytes.replace(b"\r\n", b"\n")).hexdigest()
        actual = hashlib.sha256(actual_bytes.replace(b"\r\n", b"\n")).hexdigest()
        if actual != expected:
            problems.append(f"Approved export changed: {relative}")
        data_hashes[relative] = actual
        raw_hashes[relative] = hashlib.sha256(actual_bytes).hexdigest()
    if problems:
        for problem in problems:
            print(f"FAIL: {problem}")
        raise SystemExit(1)
    report = {"publication_files_scanned": len(paths), "historical_blobs_scanned": len(blobs), "credential_pattern_findings": 0,
              "forbidden_paths": 0, "workstation_document_paths": 0, "ignore_examples_checked": ignored,
              "approved_export_lf_normalized_sha256": data_hashes, "current_export_raw_sha256": raw_hashes,
              "all_five_export_files_unchanged": len(data_hashes) == 5,
              "scope": "Current publication files, all reachable Git-history blobs and local Git config; heuristic patterns, not a guarantee against every possible secret.",
              "git_count_objects": git("count-objects", "-vH").decode("utf-8").strip()}
    assert len(data_hashes) == 5
    (ROOT / "web/qa-results").mkdir(exist_ok=True)
    (ROOT / "web/qa-results/repo-check.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"PASS: {len(paths)} publication paths, {len(blobs)} historical blobs; 0 credential-pattern findings; required ignores pass")
    print("PASS: no workstation paths in publication documents; five approved JSON exports unchanged")
    print(report["git_count_objects"])


if __name__ == "__main__":
    main()
