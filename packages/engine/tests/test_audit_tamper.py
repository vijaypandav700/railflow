"""Audit tamper tests (v0.8 exit): edit a stored entry, verify must fail at that entry."""

import json
import sqlite3
from pathlib import Path

import pytest
from railflow.audit import AuditLog, entry_hash, payload_hash


def make(n: int = 5) -> AuditLog:
    log = AuditLog()
    for i in range(n):
        log.append("REPLAN", {"i": i})
    return log


def run(log: AuditLog, sql: str, args: tuple[object, ...] = ()) -> None:
    log.raw().execute(sql, args)
    log.raw().commit()


def test_intact_chain_verifies() -> None:
    assert make().verify() == {"ok": True, "entries": 5, "first_broken": None}


@pytest.mark.parametrize("seq", [1, 3, 5])
def test_edited_payload_detected(seq: int) -> None:
    log = make()
    run(log, "UPDATE audit SET payload=? WHERE seq=?", ('{"i":999}', seq))
    out = log.verify()
    assert out["ok"] is False
    assert out["first_broken"] == seq


def test_edited_type_detected() -> None:
    log = make()
    run(log, "UPDATE audit SET type='CONFIRM' WHERE seq=2")
    assert log.verify()["first_broken"] == 2


def test_edited_timestamp_detected() -> None:
    log = make()
    run(log, "UPDATE audit SET ts='2000-01-01T00:00:00.000+00:00' WHERE seq=4")
    assert log.verify()["first_broken"] == 4


def test_edited_hash_detected() -> None:
    log = make()
    run(log, "UPDATE audit SET hash=? WHERE seq=3", ("f" * 64,))
    assert log.verify()["first_broken"] == 3


def test_deleted_middle_entry_detected() -> None:
    log = make()
    run(log, "DELETE FROM audit WHERE seq=3")
    out = log.verify()
    assert out["ok"] is False
    assert out["first_broken"] == 4


def test_rewriting_one_entry_breaks_the_next() -> None:
    log = make()
    ts, kind, prev = (
        log.raw().execute("SELECT ts, type, prev_hash FROM audit WHERE seq=2").fetchone()
    )
    body = json.dumps({"i": 999}, sort_keys=True, separators=(",", ":"))
    p_hash = payload_hash({"i": 999})
    new_hash = entry_hash(2, ts, kind, p_hash, prev)
    run(
        log,
        "UPDATE audit SET payload=?, payload_hash=?, hash=? WHERE seq=2",
        (body, p_hash, new_hash),
    )
    assert log.verify()["first_broken"] == 3


def test_tampering_a_saved_file_is_detected(tmp_path: Path) -> None:
    path = str(tmp_path / "audit.db")
    log = AuditLog(path)
    for i in range(4):
        log.append("PARSE", {"i": i})
    assert log.verify()["ok"] is True
    log.raw().close()
    db = sqlite3.connect(path)
    db.execute("UPDATE audit SET payload='{\"i\":-1}' WHERE seq=2")
    db.commit()
    db.close()
    out = AuditLog(path).verify()
    assert out["ok"] is False
    assert out["first_broken"] == 2


def test_known_limit_tail_deletion_is_not_detected() -> None:
    """Tamper-evident, not tamper-proof: dropping the newest entries leaves a valid chain."""
    log = make()
    run(log, "DELETE FROM audit WHERE seq=5")
    assert log.verify() == {"ok": True, "entries": 4, "first_broken": None}
