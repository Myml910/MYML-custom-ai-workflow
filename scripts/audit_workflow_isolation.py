#!/usr/bin/env python3
"""
Audit workflow isolation in the MYML library.

This script is read-only. It scans workflow-like JSON files, reports suspicious
copies, cross-user references, legacy-root leakage, missing media references,
and workflow id/path mismatches.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

SEVERITY_ORDER = {
    "critical": 4,
    "error": 3,
    "warning": 2,
    "info": 1,
}

LEGACY_ROOT_USERNAMES = {"myml"}
WORKFLOW_IGNORED_KEYS = {"id", "createdAt", "updatedAt", "coverUrl"}
NODE_IGNORED_KEYS = {"generationStartTime"}


@dataclass
class Issue:
    severity: str
    code: str
    message: str
    paths: list[str] = field(default_factory=list)


@dataclass
class WorkflowRecord:
    path: Path
    root_kind: str
    owner: str
    location: str
    data: dict[str, Any]
    workflow_id: str | None
    title: str
    node_count: int
    content_hash: str
    structural_hash: str
    references: list[str]
    data_url_count: int

    @property
    def rel_path(self) -> str:
        return self.location


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def default_library_dir() -> Path:
    return Path(os.environ.get("LIBRARY_DIR") or project_root() / "library").resolve()


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def hash_value(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()[:16]


def scrub_for_structural_hash(value: Any) -> Any:
    if isinstance(value, dict):
        scrubbed: dict[str, Any] = {}
        for key, child in value.items():
            if key in WORKFLOW_IGNORED_KEYS or key in NODE_IGNORED_KEYS:
                continue
            if isinstance(child, str) and child.startswith("data:"):
                scrubbed[key] = "<data-url>"
            else:
                scrubbed[key] = scrub_for_structural_hash(child)
        return scrubbed

    if isinstance(value, list):
        return [scrub_for_structural_hash(item) for item in value]

    return value


def is_workflow_like(data: Any) -> bool:
    if not isinstance(data, dict):
        return False

    nodes = data.get("nodes")
    if isinstance(nodes, list):
        return True

    return (
        "viewport" in data
        and ("title" in data or "groups" in data)
        and not isinstance(data.get("messages"), list)
    )


def read_json(path: Path) -> tuple[Any | None, str | None]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle), None
    except UnicodeDecodeError:
        try:
            with path.open("r", encoding="utf-8-sig") as handle:
                return json.load(handle), None
        except Exception as error:  # noqa: BLE001
            return None, str(error)
    except Exception as error:  # noqa: BLE001
        return None, str(error)


def classify_library_path(path: Path, library_dir: Path) -> tuple[str, str, str]:
    rel = path.resolve().relative_to(library_dir)
    parts = rel.parts
    rel_text = rel.as_posix()

    if len(parts) >= 4 and parts[0] == "users" and parts[2] == "workflows":
        return "user", parts[1], rel_text

    if len(parts) >= 2 and parts[0] == "workflows":
        return "legacy", "legacy-root", rel_text

    return "misplaced", "unknown", rel_text


def classify_public_path(path: Path, public_workflows_dir: Path) -> tuple[str, str, str]:
    rel = path.resolve().relative_to(public_workflows_dir)
    return "public", "public", f"public/workflows/{rel.as_posix()}"


def walk_strings(value: Any) -> list[str]:
    found: list[str] = []

    def visit(child: Any) -> None:
        if isinstance(child, str):
            found.append(child)
        elif isinstance(child, dict):
            for item in child.values():
                visit(item)
        elif isinstance(child, list):
            for item in child:
                visit(item)

    visit(value)
    return found


def normalize_library_url(value: str) -> str | None:
    raw = value.strip()
    if not raw:
        return None

    if raw.startswith("http://") or raw.startswith("https://"):
        try:
            raw = urlparse(raw).path
        except Exception:  # noqa: BLE001
            return None

    marker = "/library/"
    index = raw.find(marker)
    if index == -1:
        return None

    path_part = raw[index:].split("?", 1)[0].split("#", 1)[0]
    return unquote(path_part)


def extract_references(data: dict[str, Any]) -> tuple[list[str], int]:
    references: list[str] = []
    data_url_count = 0

    for value in walk_strings(data):
        if value.startswith("data:"):
            data_url_count += 1

        library_url = normalize_library_url(value)
        if library_url:
            references.append(library_url)

    return sorted(set(references)), data_url_count


def resolve_inside(root: Path, relative_parts: list[str]) -> Path | None:
    root = root.resolve()
    candidate = root.joinpath(*relative_parts).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def resolve_library_reference(library_dir: Path, reference: str) -> tuple[str, str | None, Path | None, str | None]:
    if not reference.startswith("/library/"):
        return "invalid", None, None, "not a /library URL"

    rel = reference.removeprefix("/library/")
    parts = [part for part in rel.split("/") if part]
    if not parts:
        return "invalid", None, None, "empty library path"

    if parts[0] == "users":
        if len(parts) < 3:
            return "invalid", None, None, "incomplete user library URL"
        owner = parts[1]
        resolved = resolve_inside(library_dir / "users" / owner, parts[2:])
        return "user", owner, resolved, None if resolved else "path traversal"

    resolved = resolve_inside(library_dir, parts)
    return "legacy", "legacy-root", resolved, None if resolved else "path traversal"


def add_issue(issues: list[Issue], severity: str, code: str, message: str, paths: list[str] | None = None) -> None:
    issues.append(Issue(severity=severity, code=code, message=message, paths=paths or []))


def collect_workflows(
    library_dir: Path,
    include_public: bool,
    issues: list[Issue],
) -> tuple[list[WorkflowRecord], int]:
    records: list[WorkflowRecord] = []
    scanned_json = 0

    search_roots: list[tuple[str, Path]] = [("library", library_dir)]
    public_workflows_dir = project_root() / "public" / "workflows"
    if include_public and public_workflows_dir.exists():
        search_roots.append(("public", public_workflows_dir.resolve()))

    for root_kind, root in search_roots:
        if not root.exists():
            continue

        for path in sorted(root.rglob("*.json")):
            scanned_json += 1
            data, error = read_json(path)
            if error:
                add_issue(issues, "warning", "json_parse_failed", f"Could not parse JSON: {error}", [str(path)])
                continue

            if not is_workflow_like(data):
                continue

            if not isinstance(data, dict):
                continue

            if root_kind == "library":
                kind, owner, rel = classify_library_path(path, library_dir)
            else:
                kind, owner, rel = classify_public_path(path, root)

            workflow_id = data.get("id") if isinstance(data.get("id"), str) else None
            title = str(data.get("title") or "(untitled)")
            nodes = data.get("nodes") if isinstance(data.get("nodes"), list) else []
            references, data_url_count = extract_references(data)
            structural_data = scrub_for_structural_hash(data)

            records.append(
                WorkflowRecord(
                    path=path,
                    root_kind=root_kind,
                    owner=owner,
                    location=rel,
                    data=data,
                    workflow_id=workflow_id,
                    title=title,
                    node_count=len(nodes),
                    content_hash=hash_value(data),
                    structural_hash=hash_value(structural_data),
                    references=references,
                    data_url_count=data_url_count,
                )
            )

    return records, scanned_json


def audit_records(library_dir: Path, records: list[WorkflowRecord], issues: list[Issue]) -> None:
    by_id: dict[str, list[WorkflowRecord]] = {}
    by_structural_hash: dict[str, list[WorkflowRecord]] = {}
    by_title: dict[str, list[WorkflowRecord]] = {}

    for record in records:
        if record.workflow_id:
            by_id.setdefault(record.workflow_id, []).append(record)
        if record.node_count > 0:
            by_structural_hash.setdefault(record.structural_hash, []).append(record)
        if record.title and record.title != "(untitled)":
            by_title.setdefault(record.title.strip().lower(), []).append(record)

        if record.root_kind == "library" and record.owner == "unknown":
            add_issue(
                issues,
                "error",
                "misplaced_workflow",
                "Workflow-like JSON is outside library/users/<user>/workflows or library/workflows.",
                [record.rel_path],
            )

        if record.root_kind == "library" and record.owner == "legacy-root":
            add_issue(
                issues,
                "warning",
                "legacy_root_workflow",
                "Workflow lives in legacy root library/workflows. Only the myml account should see it in current code.",
                [record.rel_path],
            )

        if not record.workflow_id:
            add_issue(issues, "error", "missing_workflow_id", "Workflow has no string id.", [record.rel_path])
        else:
            filename_id = record.path.stem
            if filename_id != record.workflow_id and record.owner != "public":
                add_issue(
                    issues,
                    "error",
                    "id_filename_mismatch",
                    f"Workflow id '{record.workflow_id}' does not match filename '{filename_id}'.",
                    [record.rel_path],
                )

            if record.owner not in {"public"} and not UUID_RE.match(record.workflow_id):
                add_issue(
                    issues,
                    "warning",
                    "non_uuid_workflow_id",
                    f"Workflow id '{record.workflow_id}' is not a UUID.",
                    [record.rel_path],
                )

        if record.data_url_count:
            add_issue(
                issues,
                "warning",
                "embedded_data_url",
                f"Workflow contains {record.data_url_count} data: URL value(s). Save sanitization should normally externalize media.",
                [record.rel_path],
            )

        for reference in record.references:
            ref_kind, ref_owner, resolved, error = resolve_library_reference(library_dir, reference)
            if error:
                add_issue(
                    issues,
                    "critical",
                    "invalid_library_reference",
                    f"Invalid library reference '{reference}': {error}.",
                    [record.rel_path],
                )
                continue

            if resolved is None or not resolved.exists():
                add_issue(
                    issues,
                    "error",
                    "missing_library_reference",
                    f"Referenced media does not exist: {reference}",
                    [record.rel_path],
                )

            if record.owner not in {"unknown", "public", "legacy-root"}:
                if ref_kind == "user" and ref_owner != record.owner:
                    add_issue(
                        issues,
                        "critical",
                        "foreign_user_reference",
                        f"Workflow owned by '{record.owner}' references another user's library: {reference}",
                        [record.rel_path],
                    )
                elif ref_kind == "legacy" and record.owner not in LEGACY_ROOT_USERNAMES:
                    add_issue(
                        issues,
                        "warning",
                        "legacy_reference_in_user_workflow",
                        f"Workflow owned by '{record.owner}' references legacy root library media: {reference}",
                        [record.rel_path],
                    )

            if record.owner == "legacy-root" and ref_kind == "user":
                add_issue(
                    issues,
                    "warning",
                    "user_reference_in_legacy_workflow",
                    f"Legacy-root workflow references user-scoped media: {reference}",
                    [record.rel_path],
                )

            if record.owner == "public" and ref_kind == "user":
                add_issue(
                    issues,
                    "critical",
                    "private_reference_in_public_workflow",
                    f"Public workflow references user-scoped media: {reference}",
                    [record.rel_path],
                )

    for workflow_id, grouped in by_id.items():
        if len(grouped) <= 1:
            continue

        owners = sorted({item.owner for item in grouped})
        severity = "critical" if len(owners) > 1 else "warning"
        add_issue(
            issues,
            severity,
            "duplicate_workflow_id",
            f"Workflow id '{workflow_id}' appears in {len(grouped)} files across owners: {', '.join(owners)}.",
            [item.rel_path for item in grouped],
        )

    for structural_hash, grouped in by_structural_hash.items():
        if len(grouped) <= 1:
            continue

        owners = sorted({item.owner for item in grouped})
        severity = "warning" if len(owners) == 1 else "error"
        add_issue(
            issues,
            severity,
            "duplicate_workflow_content",
            f"Possible copied workflow content hash {structural_hash} appears in {len(grouped)} files across owners: {', '.join(owners)}.",
            [item.rel_path for item in grouped],
        )

    for title, grouped in by_title.items():
        if len(grouped) <= 1:
            continue

        owners = sorted({item.owner for item in grouped})
        if len(owners) > 1:
            add_issue(
                issues,
                "info",
                "same_title_across_owners",
                f"Same workflow title '{title}' appears across owners: {', '.join(owners)}.",
                [item.rel_path for item in grouped],
            )


def print_text_report(library_dir: Path, scanned_json: int, records: list[WorkflowRecord], issues: list[Issue]) -> None:
    counts_by_kind: dict[str, int] = {}
    counts_by_owner: dict[str, int] = {}
    for record in records:
        counts_by_kind[record.owner if record.owner in {"legacy-root", "public", "unknown"} else "user"] = (
            counts_by_kind.get(record.owner if record.owner in {"legacy-root", "public", "unknown"} else "user", 0) + 1
        )
        counts_by_owner[record.owner] = counts_by_owner.get(record.owner, 0) + 1

    issue_counts = {severity: 0 for severity in SEVERITY_ORDER}
    for issue in issues:
        issue_counts[issue.severity] = issue_counts.get(issue.severity, 0) + 1

    print("MYML workflow isolation audit")
    print(f"Library: {library_dir}")
    print(f"JSON files scanned: {scanned_json}")
    print(f"Workflow-like files: {len(records)}")
    print("Workflow locations:")
    for key in sorted(counts_by_kind):
        print(f"  {key}: {counts_by_kind[key]}")

    if counts_by_owner:
        print("Owners:")
        for owner in sorted(counts_by_owner):
            print(f"  {owner}: {counts_by_owner[owner]}")

    print("Issues:")
    for severity in ("critical", "error", "warning", "info"):
        print(f"  {severity}: {issue_counts.get(severity, 0)}")

    if not issues:
        print("\nNo isolation issues found.")
        return

    print("\nDetails:")
    sorted_issues = sorted(
        issues,
        key=lambda item: (-SEVERITY_ORDER.get(item.severity, 0), item.code, item.message),
    )
    for issue in sorted_issues:
        print(f"\n[{issue.severity.upper()}] {issue.code}")
        print(f"  {issue.message}")
        for path in issue.paths[:12]:
            print(f"  - {path}")
        if len(issue.paths) > 12:
            print(f"  - ... {len(issue.paths) - 12} more")


def to_json_report(library_dir: Path, scanned_json: int, records: list[WorkflowRecord], issues: list[Issue]) -> dict[str, Any]:
    return {
        "library": str(library_dir),
        "jsonFilesScanned": scanned_json,
        "workflowFiles": [
            {
                "path": str(record.path),
                "location": record.rel_path,
                "owner": record.owner,
                "id": record.workflow_id,
                "title": record.title,
                "nodeCount": record.node_count,
                "contentHash": record.content_hash,
                "structuralHash": record.structural_hash,
                "references": record.references,
                "dataUrlCount": record.data_url_count,
            }
            for record in records
        ],
        "issues": [
            {
                "severity": issue.severity,
                "code": issue.code,
                "message": issue.message,
                "paths": issue.paths,
            }
            for issue in issues
        ],
    }


def should_fail(issues: list[Issue], fail_on: str) -> bool:
    if fail_on == "none":
        return False
    threshold = SEVERITY_ORDER[fail_on]
    return any(SEVERITY_ORDER.get(issue.severity, 0) >= threshold for issue in issues)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit MYML workflow isolation and copied workflow files.")
    parser.add_argument(
        "--library",
        default=str(default_library_dir()),
        help="Library directory to scan. Defaults to LIBRARY_DIR or ./library.",
    )
    parser.add_argument(
        "--include-public",
        action="store_true",
        help="Also scan public/workflows as intentionally shared templates.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON instead of text.",
    )
    parser.add_argument(
        "--fail-on",
        choices=["none", "info", "warning", "error", "critical"],
        default="none",
        help="Exit with status 2 when issues at this severity or higher are found.",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    library_dir = Path(args.library).resolve()
    issues: list[Issue] = []

    if not library_dir.exists():
        add_issue(issues, "critical", "missing_library_dir", f"Library directory does not exist: {library_dir}")
        records: list[WorkflowRecord] = []
        scanned_json = 0
    else:
        records, scanned_json = collect_workflows(library_dir, args.include_public, issues)
        audit_records(library_dir, records, issues)

    if args.json:
        print(json.dumps(to_json_report(library_dir, scanned_json, records, issues), indent=2, ensure_ascii=False))
    else:
        print_text_report(library_dir, scanned_json, records, issues)

    return 2 if should_fail(issues, args.fail_on) else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
