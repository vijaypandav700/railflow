"""Hash-chained audit log (FR-13). Tamper-evident, not tamper-proof."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
from datetime import UTC, datetime
from typing import Any

Json = dict[str, Any]
TYPES = ("PARSE", "CONFIRM", "REJECT", "REPLAN", "VALIDATE", "REFUSED")
GENESIS = "0" * 64


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def payload_hash(payload: Json) -> str:
    return _sha(json.dumps(payload, sort_keys=True, separators=(",", ":")))


def entry_hash(seq: int, ts: str, kind: str, p_hash: str, prev: str) -> str:
    return _sha("|".join([str(seq), ts, kind, p_hash, prev]))


class AuditLog:
    def __init__(self, path: str = ":memory:") -> None:
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._lock = threading.Lock()
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS audit ("
            "seq INTEGER PRIMARY KEY, ts TEXT NOT NULL, actor TEXT NOT NULL, "
            "type TEXT NOT NULL, payload TEXT NOT NULL, payload_hash TEXT NOT NULL, "
            "prev_hash TEXT NOT NULL, hash TEXT NOT NULL)"
        )
        self._db.commit()

    def append(self, kind: str, payload: Json, actor: str = "operator") -> Json:
        if kind not in TYPES:
            raise ValueError(f"unknown audit type {kind}")
        with self._lock:
            row = self._db.execute(
                "SELECT seq, hash FROM audit ORDER BY seq DESC LIMIT 1"
            ).fetchone()
            seq = 1 if row is None else int(row[0]) + 1
            prev = GENESIS if row is None else str(row[1])
            ts = datetime.now(UTC).isoformat(timespec="milliseconds")
            body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
            p_hash = _sha(body)
            h = entry_hash(seq, ts, kind, p_hash, prev)
            self._db.execute(
                "INSERT INTO audit VALUES (?,?,?,?,?,?,?,?)",
                (seq, ts, actor, kind, body, p_hash, prev, h),
            )
            self._db.commit()
        return {"seq": seq, "ts": ts, "type": kind, "hash": h}

    def entries(self, limit: int = 200) -> list[Json]:
        cur = self._db.execute(
            "SELECT seq, ts, actor, type, payload, payload_hash, prev_hash, hash "
            "FROM audit ORDER BY seq DESC LIMIT ?",
            (limit,),
        )
        keys = ["seq", "ts", "actor", "type", "payload", "payload_hash", "prev_hash", "hash"]
        return [dict(zip(keys, r, strict=True)) for r in cur.fetchall()]

    def verify(self) -> Json:
        prev = GENESIS
        count = 0
        for seq, ts, kind, body, p_hash, prev_hash, h in self._db.execute(
            "SELECT seq, ts, type, payload, payload_hash, prev_hash, hash FROM audit ORDER BY seq"
        ):
            count += 1
            ok = (
                _sha(body) == p_hash
                and prev_hash == prev
                and entry_hash(seq, ts, kind, p_hash, prev_hash) == h
            )
            if not ok:
                return {"ok": False, "entries": count, "first_broken": seq}
            prev = h
        return {"ok": True, "entries": count, "first_broken": None}

    def raw(self) -> sqlite3.Connection:
        """Test hook: direct DB access to simulate tampering."""
        return self._db
