import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import plugin from "./index";
import { runSessionSearch, runSessionTranscript } from "./history";
import type { Plugin } from "@opencode/plugin";
import type { Info } from "@opencode/plugin/promise/tool";

let directory: string;
let db: Database;
let previousPath: string | undefined;
const now = Date.now();

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "session-history-"));
  previousPath = process.env.OPENCODE_DB_PATH;
  process.env.OPENCODE_DB_PATH = join(directory, "history.db");
  db = new Database(process.env.OPENCODE_DB_PATH);
  db.exec(
    "CREATE TABLE project (id TEXT PRIMARY KEY, name TEXT, worktree TEXT)",
  );
  db.exec("INSERT INTO project VALUES ('project', 'Example', '/project')");
});

afterEach(() => {
  db.close();
  if (previousPath === undefined) delete process.env.OPENCODE_DB_PATH;
  else process.env.OPENCODE_DB_PATH = previousPath;
  rmSync(directory, { recursive: true, force: true });
});

function sessionTable(name: string) {
  db.exec(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, title TEXT, directory TEXT, slug TEXT,
    project_id TEXT, time_created INTEGER, time_updated INTEGER)`);
}

function addSession(table: string, id: string) {
  db.query(
    `INSERT INTO ${table} VALUES (?, ?, '/project', 'example', 'project', ?, ?)`,
  ).run(id, `${table} title`, now, now);
}

function v1(id = "ses_legacy") {
  sessionTable("session");
  db.exec("CREATE TABLE message (id TEXT PRIMARY KEY, data TEXT)");
  db.exec(
    "CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, data TEXT)",
  );
  addSession("session", id);
  db.query("INSERT INTO message VALUES (?, ?)").run(
    "old_msg",
    JSON.stringify({ role: "user" }),
  );
  db.query("INSERT INTO part VALUES (?, ?, ?, ?, ?)").run(
    "old_part",
    "old_msg",
    id,
    now,
    JSON.stringify({ type: "text", text: "fix auth login 100%_" }),
  );
}

function v2(id = "ses_modern") {
  sessionTable("session_v2");
  db.exec(
    "CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT, type TEXT, seq INTEGER, time_created INTEGER, data TEXT)",
  );
  addSession("session_v2", id);
  const insert = db.query(
    "INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?)",
  );
  insert.run(
    "msg_user",
    id,
    "user",
    1,
    now,
    JSON.stringify({ text: "fix auth login 100%_" }),
  );
  insert.run(
    "msg_assistant",
    id,
    "assistant",
    2,
    now,
    JSON.stringify({
      content: [
        { type: "reasoning", text: "secret reasoning" },
        { type: "text", text: "auth login fixed" },
        { type: "tool", name: "shell", input: { command: "secret command" } },
        { type: "text", text: "added regression tests" },
      ],
    }),
  );
  insert.run(
    "msg_system",
    id,
    "system",
    3,
    now,
    JSON.stringify({ text: "secret system" }),
  );
}

describe("read-only history layouts", () => {
  test("V1 search and transcript preserve existing output", () => {
    v1();
    expect(
      runSessionSearch({ query: "auth login" }).sessions[0].sessionId,
    ).toBe("ses_legacy");
    const transcript = runSessionTranscript({ sessionId: "ses_legacy" });
    expect(transcript.found).toBe(true);
    expect(transcript.entries[0]).toMatchObject({
      partId: "old_part",
      role: "user",
      text: "fix auth login 100%_",
    });
  });

  test("V2 search reads user text and assistant text, excluding reasoning and tools", () => {
    v2();
    const result = runSessionSearch({ query: "AUTH login" });
    expect(result.stats.totalMatches).toBe(2);
    expect(result.sessions[0].matchCount).toBe(2);
    expect(runSessionSearch({ query: "secret" }).sessions).toEqual([]);
    expect(runSessionSearch({ query: "100%_" }).stats.totalMatches).toBe(1);
    expect(runSessionSearch({ query: "100%X" }).stats.totalMatches).toBe(0);
  });

  test("V2 transcript defaults, limit, and ordering include all text parts", () => {
    v2();
    const result = runSessionTranscript({ sessionId: "ses_modern" });
    expect(result.entries.map((entry) => entry.text)).toEqual([
      "fix auth login 100%_",
      "auth login fixed",
      "added regression tests",
    ]);
    expect(result.entries[1].partId).toBe("msg_assistant:1");
    expect(
      runSessionTranscript({ sessionId: "ses_modern", order: "desc", limit: 1 })
        .entries[0].text,
    ).toBe("added regression tests");
  });

  test("mixed databases retain unmigrated sessions and deduplicate migrated sessions", () => {
    v1("ses_migrated");
    v2("ses_migrated");
    addSession("session", "ses_old_only");
    db.query("INSERT INTO part VALUES (?, ?, ?, ?, ?)").run(
      "other",
      "old_msg",
      "ses_old_only",
      now,
      JSON.stringify({ type: "text", text: "auth login" }),
    );
    const result = runSessionSearch({ query: "auth" });
    expect(result.stats).toEqual({ totalSessions: 2, totalMatches: 3 });
    expect(result.sessions[0].title).toBe("session_v2 title");
    expect(
      runSessionTranscript({ sessionId: "ses_migrated" }).entries,
    ).toHaveLength(3);
  });

  test("search respects the time window, empty input, and missing sessions", () => {
    v2();
    db.query("UPDATE session_message SET time_created = ?").run(
      now - 181 * 24 * 60 * 60 * 1000,
    );
    expect(runSessionSearch({ query: "auth" }).sessions).toEqual([]);
    expect(runSessionSearch({ query: "   " }).error?.code).toBe(
      "INVALID_QUERY",
    );
    expect(runSessionTranscript({ sessionId: "missing" }).found).toBe(false);
  });

  test("queries never modify the database or persist helper views", () => {
    v2();
    const before = readFileSync(process.env.OPENCODE_DB_PATH!);
    runSessionSearch({ query: "auth" });
    runSessionTranscript({ sessionId: "ses_modern" });
    expect(readFileSync(process.env.OPENCODE_DB_PATH!)).toEqual(before);
    expect(
      db
        .query("SELECT name FROM sqlite_master WHERE name LIKE 'history_%'")
        .all(),
    ).toEqual([]);
  });

  test("missing and unsupported databases return structured errors", () => {
    expect(runSessionSearch({ query: "auth" }).error?.details).toContain(
      "Unsupported",
    );
    process.env.OPENCODE_DB_PATH = join(directory, "missing.db");
    expect(
      runSessionTranscript({ sessionId: "ses_missing" }).error,
    ).toMatchObject({ code: "DB_OPEN_FAILED" });
  });
});

test("V2 registration is replayable and executors apply omitted defaults", async () => {
  v2();
  const tools: Info[] = [];
  await plugin.setup({
    tool: {
      transform: async (
        transform: (editor: { add(tool: Info): void }) => void,
      ) => {
        transform({ add: (tool) => tools.push(tool) });
        return { dispose: async () => {} };
      },
    },
  } as unknown as Plugin.Context);
  expect(tools.map((tool) => tool.name)).toEqual([
    "session-search",
    "session-transcript",
  ]);
  const result = await tools[1].execute(
    { sessionId: "ses_modern" },
    {} as never,
  );
  expect(JSON.parse(result.content as string).entries).toHaveLength(3);
});

test("V1 server entrypoint still exposes both legacy tools", async () => {
  v1();
  const hooks = await plugin.server({} as never);
  expect(Object.keys(hooks.tool!)).toEqual([
    "session-search",
    "session-transcript",
  ]);
  const result = await hooks.tool!["session-search"].execute(
    { query: "auth" },
    {} as never,
  );
  expect(JSON.parse(typeof result === "string" ? result : result.output).stats.totalMatches).toBe(1);
});
