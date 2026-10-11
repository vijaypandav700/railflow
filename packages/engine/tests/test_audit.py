import pytest
from railflow.audit import AuditLog


def filled() -> AuditLog:
    log = AuditLog()
    log.append("PARSE", {"text": "T101 25 min late"})
    log.append("CONFIRM", {"ids": ["d1"]})
    log.append("REPLAN", {"status": "OPTIMAL"})
    return log


def test_empty_chain_ok() -> None:
    assert AuditLog().verify() == {"ok": True, "entries": 0, "first_broken": None}


def test_chain_ok_and_linked() -> None:
    log = filled()
    assert log.verify()["ok"] is True
    rows = log.entries()
    assert rows[0]["prev_hash"] == rows[1]["hash"]


def test_edited_payload_detected_at_entry() -> None:
    log = filled()
    db = log.raw()
    db.execute("UPDATE audit SET payload = ? WHERE seq = 2", ('{"ids":["evil"]}',))
    db.commit()
    assert log.verify() == {"ok": False, "entries": 2, "first_broken": 2}


def test_deleted_entry_detected() -> None:
    log = filled()
    db = log.raw()
    db.execute("DELETE FROM audit WHERE seq = 2")
    db.commit()
    result = log.verify()
    assert result["ok"] is False and result["first_broken"] == 3


def test_unknown_type_rejected() -> None:
    with pytest.raises(ValueError):
        AuditLog().append("HACK", {})
