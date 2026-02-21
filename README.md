# OpenCode Session Search

A plugin for OpenCode that provides tools to search and retrieve your local chat history.

## Tools

### `session-search`

Search your local OpenCode chat history for sessions containing specific text.

**Args**
- `query` (string, required): Text to search for (1-200 chars, non-whitespace)
- `limitSessions` (number, optional): Max sessions to return (1-12, default: 6)

**Returns**
- Matching sessions with metadata (title, directory, match count)
- Snippets from each session (2 per session, 220 chars each)
- Suggested `session-transcript` calls and a `question`-tool prompt to let users pick which session to open

### `session-transcript`

Reconstruct the full transcript of a specific chat session.

**Args**
- `sessionId` (string, required): Session ID (e.g., `ses_xxx`)
- `limit` (number, optional): Max entries to return (1-120, default: 80)
- `order` (string, optional): `asc` or `desc` (default: `asc`)

**Returns**
- Session metadata (title, slug, directory, project info)
- Full conversation entries with timestamps and roles

## Installation

### npm (Recommended)

Add the package to your OpenCode config:

```json
{
  "plugin": ["opencode-session-history"]
}
```

Supported config locations:
- Global config: `~/.config/opencode/opencode.json`
- Project config: `.opencode/opencode.json`

Restart OpenCode so the plugin is loaded.

## Example Usage

```
Find my recent work on authentication:
⚙ session-search [query=auth login, limitSessions=5]

Get the full conversation:
⚙ session-transcript [sessionId=ses_abc123, limit=100]
```

Run the same search from your terminal:

```bash
bun run search -- "auth login" --limitSessions 5
```

This command uses the same query path as the `session-search` tool and prints JSON.

## Development

### Local install

Install directly from this repo:

```bash
bun run install:local
```

This copies `index.ts` to:

```bash
~/.config/opencode/plugins/history.ts
```

Manual copy option:

```bash
mkdir -p ~/.config/opencode/plugins
cp index.ts ~/.config/opencode/plugins/history.ts
```

Restart OpenCode and the tools will be available automatically.

## Versioning

This package follows Semantic Versioning (`MAJOR.MINOR.PATCH`).

- `PATCH`: backward-compatible fixes
- `MINOR`: backward-compatible features
- `MAJOR`: breaking changes

Recommended release commands:

```bash
bun pm version patch
bun pm version minor
bun pm version major
```

Then publish:

```bash
bun publish
```

## Configuration

The plugin resolves the DB path in this order:
1. `OPENCODE_DB_PATH` env var (if set)
2. `opencode db path` (platform-aware)
3. Fallback: `~/.local/share/opencode/opencode.db`

## Publish Checklist

- Run type checks: `bun run test` (or `bun run typecheck`)
- Build distributable file: `bun run build`
- Preview package contents: `bun pm pack --dry-run`
- Confirm version bump uses SemVer (`bun pm version patch|minor|major`)
- Publish: `bun publish`

## License

MIT
