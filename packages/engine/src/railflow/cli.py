"""Command line: railflow validate plan.json. Exit 0 valid, 1 invalid, 2 bad file."""

import argparse
import json
import sys
from pathlib import Path

from railflow import __version__
from railflow.detector import detect
from railflow.planfile import PlanFileError, load_plan_file
from railflow.replan import replan
from railflow.solver import assign
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
    assign_cmd = commands.add_parser("assign", help="solve a platform plan")
    assign_cmd.add_argument("file", type=Path)
    replan_cmd = commands.add_parser("replan", help="replan from now")
    replan_cmd.add_argument("file", type=Path)
    args = parser.parse_args(argv)

    try:
        data = load_plan_file(args.file)
    except PlanFileError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    if args.command == "replan":
        out = replan(data)
        was = {r["train_id"]: r for r in out["previous_plan"]}
        print(f"status {out['status']}")
        for r in out["plan"]:
            new = (r["platform"], r["arr"], r["dep"])
            old = was.get(r["train_id"])
            before = (old["platform"], old["arr"], old["dep"]) if old else new
            note = f"  <- was {before[0]} {before[1]}-{before[2]}" if before != new else ""
            print(f"{r['train_id']:<8}{new[0]:<5}{new[1]:>5}{new[2]:>5}{note}")
        for u in out["unscheduled"]:
            print(f"{u['train_id']:<8}UNSCHEDULED {u['reason']}")
        for w in out["warnings"]:
            print(f"WARN {w['code']} closure {w['closure']} trains {', '.join(w['trains'])}")
        if out["status"] not in ("OPTIMAL", "FEASIBLE"):
            return 1
        check = validate(
            {
                **data,
                "plan": out["plan"],
                "unscheduled": out["unscheduled"],
                "previous_plan": out["previous_plan"],
            }
        )
        print("VALID" if check["valid"] else "INVALID")
        return 0 if check["valid"] else 1
    if args.command == "assign":
        out = assign(data)
        print(f"status {out['status']}")
        for r in out["plan"]:
            print(f"{r['train_id']:<8}{r['platform']:<5}{r['arr']:>5}{r['dep']:>5}")
        for u in out["unscheduled"]:
            print(f"{u['train_id']:<8}UNSCHEDULED {u['reason']}")
        for c in out["conflicts"]:
            print(f"INFEASIBLE {', '.join(c['trains'])} on {c['platform']}")
        if out["status"] not in ("OPTIMAL", "FEASIBLE"):
            return 1
        check = validate({**data, "plan": out["plan"], "unscheduled": out["unscheduled"]})
        print("VALID" if check["valid"] else "INVALID")
        return 0 if check["valid"] else 1
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
