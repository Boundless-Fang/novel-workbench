import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

from paths_config import PROJECT_ROOT

DB_FILENAME = "style_sync.db"
DB_PATH_ENV = "STYLE_SYNC_DB_PATH"

SCHEMA_VERSION = 1


def get_db_path() -> str:
    env_path = os.environ.get(DB_PATH_ENV, "").strip()
    if env_path:
        return env_path
    return os.path.join(PROJECT_ROOT, DB_FILENAME)


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'default',
    reference_style TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    chapter_no INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    filename TEXT NOT NULL,
    word_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE (project_id, filename),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS character_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    character_name TEXT NOT NULL,
    anchor_chapter INTEGER NOT NULL,
    field TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE (project_id, character_name, field, anchor_chapter),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dormant_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'item',
    entity_name TEXT NOT NULL,
    first_seen_chapter INTEGER,
    last_active_chapter INTEGER,
    status TEXT NOT NULL DEFAULT 'dormant',
    description TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE (project_id, entity_type, entity_name),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chapter_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    chapter_no INTEGER NOT NULL,
    metric_key TEXT NOT NULL,
    metric_value REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE (project_id, chapter_no, metric_key),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chapters_project_no ON chapters(project_id, chapter_no);
CREATE INDEX IF NOT EXISTS idx_character_states_project ON character_states(project_id, character_name);
CREATE INDEX IF NOT EXISTS idx_dormant_project_status ON dormant_entities(project_id, status);
CREATE INDEX IF NOT EXISTS idx_metrics_project_chapter ON chapter_metrics(project_id, chapter_no);
"""


def connect() -> sqlite3.Connection:
    db_path = get_db_path()
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


@contextmanager
def transaction(conn: Optional[sqlite3.Connection] = None):
    owns_conn = conn is None
    if owns_conn:
        conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        if owns_conn:
            conn.close()


def init_schema(conn: Optional[sqlite3.Connection] = None) -> None:
    with transaction(conn) as db:
        db.executescript(SCHEMA_SQL)
        db.execute(
            "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)",
            (str(SCHEMA_VERSION),),
        )


def _row_to_dict(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    return dict(row) if row is not None else None


# --------------------------------------------------------------------------- #
# projects
# --------------------------------------------------------------------------- #
def upsert_project(
    name: str,
    display_name: str = "",
    mode: str = "default",
    reference_style: str = "",
    conn: Optional[sqlite3.Connection] = None,
) -> int:
    now = _now()
    with transaction(conn) as db:
        db.execute(
            """
            INSERT INTO projects (name, display_name, mode, reference_style, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (name) DO UPDATE SET
                display_name = excluded.display_name,
                mode = excluded.mode,
                reference_style = excluded.reference_style,
                updated_at = excluded.updated_at
            """,
            (name, display_name, mode, reference_style, now, now),
        )
        row = db.execute("SELECT id FROM projects WHERE name = ?", (name,)).fetchone()
        return int(row["id"])


def get_project(name: str, conn: Optional[sqlite3.Connection] = None) -> Optional[Dict[str, Any]]:
    with transaction(conn) as db:
        row = db.execute("SELECT * FROM projects WHERE name = ?", (name,)).fetchone()
        return _row_to_dict(row)


def list_projects(conn: Optional[sqlite3.Connection] = None) -> List[Dict[str, Any]]:
    with transaction(conn) as db:
        rows = db.execute("SELECT * FROM projects ORDER BY name").fetchall()
        return [dict(r) for r in rows]


def delete_project(name: str, conn: Optional[sqlite3.Connection] = None) -> bool:
    with transaction(conn) as db:
        cur = db.execute("DELETE FROM projects WHERE name = ?", (name,))
        return cur.rowcount > 0


# --------------------------------------------------------------------------- #
# chapters
# --------------------------------------------------------------------------- #
def upsert_chapter(
    project_id: int,
    chapter_no: int,
    title: str,
    filename: str,
    word_count: int = 0,
    conn: Optional[sqlite3.Connection] = None,
) -> int:
    now = _now()
    with transaction(conn) as db:
        db.execute(
            """
            INSERT INTO chapters (project_id, chapter_no, title, filename, word_count, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (project_id, filename) DO UPDATE SET
                chapter_no = excluded.chapter_no,
                title = excluded.title,
                word_count = excluded.word_count,
                updated_at = excluded.updated_at
            """,
            (project_id, chapter_no, title, filename, word_count, now),
        )
        row = db.execute(
            "SELECT id FROM chapters WHERE project_id = ? AND filename = ?",
            (project_id, filename),
        ).fetchone()
        return int(row["id"])


def list_chapters(project_id: int, conn: Optional[sqlite3.Connection] = None) -> List[Dict[str, Any]]:
    with transaction(conn) as db:
        rows = db.execute(
            "SELECT * FROM chapters WHERE project_id = ? ORDER BY chapter_no",
            (project_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def delete_chapter(project_id: int, filename: str, conn: Optional[sqlite3.Connection] = None) -> bool:
    with transaction(conn) as db:
        cur = db.execute(
            "DELETE FROM chapters WHERE project_id = ? AND filename = ?",
            (project_id, filename),
        )
        return cur.rowcount > 0


# --------------------------------------------------------------------------- #
# character_states
# --------------------------------------------------------------------------- #
def upsert_character_state(
    project_id: int,
    character_name: str,
    anchor_chapter: int,
    field: str,
    value: str,
    conn: Optional[sqlite3.Connection] = None,
) -> int:
    now = _now()
    with transaction(conn) as db:
        db.execute(
            """
            INSERT INTO character_states
                (project_id, character_name, anchor_chapter, field, value, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (project_id, character_name, field, anchor_chapter) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            """,
            (project_id, character_name, anchor_chapter, field, value, now),
        )
        row = db.execute(
            "SELECT id FROM character_states WHERE project_id = ? AND character_name = ? AND field = ? AND anchor_chapter = ?",
            (project_id, character_name, field, anchor_chapter),
        ).fetchone()
        return int(row["id"])


def get_latest_character_state(
    project_id: int,
    character_name: str,
    field: str,
    conn: Optional[sqlite3.Connection] = None,
) -> Optional[Dict[str, Any]]:
    with transaction(conn) as db:
        row = db.execute(
            """
            SELECT * FROM character_states
            WHERE project_id = ? AND character_name = ? AND field = ?
            ORDER BY anchor_chapter DESC LIMIT 1
            """,
            (project_id, character_name, field),
        ).fetchone()
        return _row_to_dict(row)


def list_character_states(
    project_id: int,
    character_name: Optional[str] = None,
    conn: Optional[sqlite3.Connection] = None,
) -> List[Dict[str, Any]]:
    with transaction(conn) as db:
        if character_name:
            rows = db.execute(
                "SELECT * FROM character_states WHERE project_id = ? AND character_name = ? ORDER BY anchor_chapter",
                (project_id, character_name),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM character_states WHERE project_id = ? ORDER BY character_name, anchor_chapter",
                (project_id,),
            ).fetchall()
        return [dict(r) for r in rows]


# --------------------------------------------------------------------------- #
# dormant_entities
# --------------------------------------------------------------------------- #
def upsert_dormant_entity(
    project_id: int,
    entity_type: str,
    entity_name: str,
    first_seen_chapter: Optional[int] = None,
    last_active_chapter: Optional[int] = None,
    status: str = "dormant",
    description: str = "",
    conn: Optional[sqlite3.Connection] = None,
) -> int:
    now = _now()
    with transaction(conn) as db:
        db.execute(
            """
            INSERT INTO dormant_entities
                (project_id, entity_type, entity_name, first_seen_chapter,
                 last_active_chapter, status, description, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (project_id, entity_type, entity_name) DO UPDATE SET
                first_seen_chapter = COALESCE(excluded.first_seen_chapter, dormant_entities.first_seen_chapter),
                last_active_chapter = excluded.last_active_chapter,
                status = excluded.status,
                description = excluded.description,
                updated_at = excluded.updated_at
            """,
            (project_id, entity_type, entity_name, first_seen_chapter,
             last_active_chapter, status, description, now),
        )
        row = db.execute(
            "SELECT id FROM dormant_entities WHERE project_id = ? AND entity_type = ? AND entity_name = ?",
            (project_id, entity_type, entity_name),
        ).fetchone()
        return int(row["id"])


def list_dormant_entities(
    project_id: int,
    status: Optional[str] = None,
    conn: Optional[sqlite3.Connection] = None,
) -> List[Dict[str, Any]]:
    with transaction(conn) as db:
        if status:
            rows = db.execute(
                "SELECT * FROM dormant_entities WHERE project_id = ? AND status = ? ORDER BY first_seen_chapter",
                (project_id, status),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM dormant_entities WHERE project_id = ? ORDER BY status, first_seen_chapter",
                (project_id,),
            ).fetchall()
        return [dict(r) for r in rows]


# --------------------------------------------------------------------------- #
# chapter_metrics
# --------------------------------------------------------------------------- #
def upsert_chapter_metric(
    project_id: int,
    chapter_no: int,
    metric_key: str,
    metric_value: float,
    conn: Optional[sqlite3.Connection] = None,
) -> int:
    now = _now()
    with transaction(conn) as db:
        db.execute(
            """
            INSERT INTO chapter_metrics (project_id, chapter_no, metric_key, metric_value, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (project_id, chapter_no, metric_key) DO UPDATE SET
                metric_value = excluded.metric_value,
                updated_at = excluded.updated_at
            """,
            (project_id, chapter_no, metric_key, float(metric_value), now),
        )
        row = db.execute(
            "SELECT id FROM chapter_metrics WHERE project_id = ? AND chapter_no = ? AND metric_key = ?",
            (project_id, chapter_no, metric_key),
        ).fetchone()
        return int(row["id"])


def list_chapter_metrics(
    project_id: int,
    conn: Optional[sqlite3.Connection] = None,
) -> List[Dict[str, Any]]:
    with transaction(conn) as db:
        rows = db.execute(
            "SELECT * FROM chapter_metrics WHERE project_id = ? ORDER BY chapter_no",
            (project_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_baseline_metric(
    project_id: int,
    metric_key: str,
    conn: Optional[sqlite3.Connection] = None,
) -> Optional[Dict[str, Any]]:
    with transaction(conn) as db:
        row = db.execute(
            """
            SELECT metric_key, AVG(metric_value) AS mean_value, COUNT(*) AS sample_count
            FROM chapter_metrics
            WHERE project_id = ? AND metric_key = ?
            """,
            (project_id, metric_key),
        ).fetchone()
        return _row_to_dict(row)
