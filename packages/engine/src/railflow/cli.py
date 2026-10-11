"""Command line: railflow validate plan.json. Exit 0 valid, 1 invalid, 2 bad file."""

import argparse
import json
import sys
from pathlib import Path

from railflow import __version__
from railflow.detector import detect
from railflow.planfile import PlanFileError, load_plan_file
from railflow.validator import Json, validate


def _render(result: Json) -> str:
    lines: list[str] = []
    for check in result["checks"]:
        lines.append(f"{check['id']:<5}{'PASS' if check['ok'] else 'FAIL'}")
        for error in check["errors"]:
            lines.append(f"      - {error['message']}")
    for warning in result["warnings"]:
        trains = ", ".join(warning["trains"])
        lines.append(f"WARN  {warning['code']}: closure {warning['closure']}, trains {trains}")
    lines.append("VALID" if result["valid"] else "INVALID")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="railflow")
    parser.add_argument("--version", action="version", version=f"railflow {__version__}")
    commands = parser.add_subparsers(dest="command", required=True)
    validate_cmd = commands.add_parser("validate", help="validate a plan file")
    validate_cmd.add_argument("file", type=Path)
    validate_cmd.add_argument("--json", action="store_true", dest="as_json")
    detect_cmd = commands.add_parser("detect", help="list conflicts in a plan file")
    detect_cmd.add_argument("file", type=Path)
    detect_cmd.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args(argv)

    try:
        data = load_plan_file(args.file)
    except PlanFileError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    if args.command == "detect":
        conflicts = detect(data)
        if args.as_json:
            print(json.dumps(conflicts, indent=2))
        else:
            for c in conflicts:
                print(
                    f"{c['type']:<18}{c['platform']:<5}{', '.join(c['trains'])}  {c['minutes']} min"
                )
            print(f"{len(conflicts)} conflict(s)")
        return 1 if conflicts else 0
    result = validate(data)
    print(json.dumps(result, indent=2) if args.as_json else _render(result))
    return 0 if result["valid"] else 1
