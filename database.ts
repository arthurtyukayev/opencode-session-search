import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export function resolveDbPath(): string {
  if (process.env.OPENCODE_DB_PATH) return process.env.OPENCODE_DB_PATH;

  // V2's debug command also resolves OPENCODE_DB and release-channel paths.
  for (const args of [
    ["debug", "paths", "db"],
    ["db", "path"],
  ]) {
    try {
      const result = spawnSync("opencode", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      });
      const path = result.stdout?.trim();
      if (result.status === 0 && path && !path.includes("\n")) return path;
    } catch {
      // Try the older command, then the platform's default data location.
    }
  }
  return join(
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
    "opencode",
    "opencode.db",
  );
}

// Only TEMP views are created; the history database is always opened read-only.
// Normalize both layouts without persisting changes or copying the database.
export function createHistoryViews(db: Database): void {
  const tables = new Set(
    db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      )
      .all()
      .map((row) => row.name),
  );
  const v1 = ["session", "message", "part"].every((table) => tables.has(table));
  const v2 = ["session_v2", "session_message"].every((table) =>
    tables.has(table),
  );
  if (!v1 && !v2)
    throw new Error("Unsupported OpenCode history database layout");

  const sessionColumns =
    "id, title, directory, slug, project_id, time_created, time_updated";
  const sessions: string[] = [];
  const text: string[] = [];
  if (v2) {
    sessions.push(`SELECT ${sessionColumns} FROM session_v2`);
    text.push(`
      SELECT m.id || ':0' AS id, m.id AS message_id, m.session_id, m.time_created,
             m.seq, 0 AS part_index, 'user' AS role, json_extract(m.data, '$.text') AS text
      FROM session_message m WHERE m.type = 'user'
      UNION ALL
      SELECT m.id || ':' || c.key, m.id, m.session_id, m.time_created,
             m.seq, CAST(c.key AS INTEGER), 'assistant', json_extract(c.value, '$.text')
      FROM session_message m, json_each(m.data, '$.content') c
      WHERE m.type = 'assistant' AND json_extract(c.value, '$.type') = 'text'
    `);
  }
  if (v1) {
    // V2 may retain V1 tables after migrating a session. Prefer the V2 copy.
    const unmigrated = v2 ? "WHERE id NOT IN (SELECT id FROM session_v2)" : "";
    sessions.push(`SELECT ${sessionColumns} FROM session ${unmigrated}`);
    text.push(`
      SELECT p.id, p.message_id, p.session_id, p.time_created,
             p.time_created AS seq, p.id AS part_index,
             json_extract(m.data, '$.role') AS role, json_extract(p.data, '$.text') AS text
      FROM part p JOIN message m ON m.id = p.message_id
      WHERE json_extract(p.data, '$.type') = 'text'
        AND json_extract(m.data, '$.role') IN ('user', 'assistant')
        ${v2 ? "AND p.session_id NOT IN (SELECT id FROM session_v2)" : ""}
    `);
  }
  db.exec(
    `CREATE TEMP VIEW history_session AS ${sessions.join(" UNION ALL ")}`,
  );
  db.exec(`CREATE TEMP VIEW history_text AS ${text.join(" UNION ALL ")}`);
}

export function openReadonlyDb() {
  const dbPath = resolveDbPath();
  let db: Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true, create: false, strict: true });
    createHistoryViews(db);
    return { db, dbPath, error: null };
  } catch (error) {
    db?.close();
    return {
      db: null,
      dbPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
