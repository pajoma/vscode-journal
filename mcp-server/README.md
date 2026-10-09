# Journal MCP Server

Deterministic MCP server for the markdown journal of the vscode-journal extension. No LLM, no database: the calling assistant interprets, the server reads, validates and writes.

## Tools

| Tool | Purpose |
| --- | --- |
| `get_daily_journal` | Read one day, structured as tasks, time entries and notes |
| `list_tasks` | Tasks over a date range (max. 92 days), filter open/done/all |
| `add_task` / `update_task` | Add a task, complete, reopen or reword it |
| `list_time_entries` | Time entries over a date range, with hours per project |
| `add_time_entry` / `update_time_entry` | Add/correct a row in `## Zeiterfassung`; duration is computed, overlaps are reported as warnings |
| `add_note` / `append_note` | Append a note at the end, or below an existing heading |

Changes to existing entries use temporary `ref`s (`L<line>-<hash>`), valid only while the line is unchanged. No IDs are written into the files.

Files: `<base>/YYYY/MM/YYYY-MM-DD.md` (older `DD.md` files are read as well). Clients pass dates only, never paths.

## Privacy

**`#private` / `#privat`** (always active, add more tags via `PRIVATE_TAGS`): tagged content never leaves the server — not as content, nor in error messages, overlap warnings or totals. Refs to private lines behave like stale refs; private headings do not exist for `append_note`.

```markdown
## Salary review #private         ← section including all sub-sections

## Family
#private #family                  ← tag-only line right below the heading

- [ ] Doctor's appointment #privat ← single task or time-entry row
```

`#private` in the H1 title line makes the whole file private. New notes are inserted before a trailing private section so they do not disappear into it.

**`NOTES_READABLE`** (default `false`): the notes area is not returned at all — no content, no headings, no tasks inside it. `add_note` and `append_note` still work. `.env.local.example` sets it to `true` for local use.

**Two tokens:** `MCP_AUTH_TOKEN` has full access. The optional `MCP_WRITE_TOKEN` only sees `add_task`, `add_time_entry` and `add_note` and gets nothing back; overlaps are only counted.

## Local use in VS Code

```sh
cd mcp-server
npm install
cp .env.local.example .env.local   # check JOURNAL_REPO_PATH
npm test
```

- **Copilot / VS Code agent mode:** `.vscode/mcp.json` defines the server `journal` (stdio, no token). Click *Start* in the file or run `MCP: List Servers`.
- **Debug over HTTP:** launch config *MCP Server (HTTP)* (F5), then start `journal-http` in `.vscode/mcp.json` (prompts for the token).
- **Claude Code:**
  ```sh
  claude mcp add journal -e JOURNAL_REPO_PATH=~/journal -- \
    node "$PWD/node_modules/tsx/dist/cli.mjs" "$PWD/src/stdio.ts"
  ```

Locally `GIT_SYNC=false`: the server only writes files, you commit yourself.

## Container (e.g. on a NAS)

```sh
cd mcp-server
mkdir -p data/ssh
# deploy key with write access to the journal repository only (GitHub → repo → Settings → Deploy keys)
ssh-keygen -t ed25519 -N "" -f data/ssh/id_ed25519
ssh-keyscan github.com > data/ssh/known_hosts
GIT_SSH_COMMAND="ssh -i data/ssh/id_ed25519 -o UserKnownHostsFile=data/ssh/known_hosts" \
  git clone git@github.com:<owner>/<journal-repo>.git data/journal
sudo chown -R 1000:1000 data

cp .env.example .env               # set MCP_AUTH_TOKEN: openssl rand -hex 32
# only docker-compose.yml, .env and data/ are needed on the host
docker compose pull && docker compose up -d
curl http://<host>:3000/healthz
```

Terminate HTTPS at a reverse proxy in front of the container (QNAP reverse proxy, Caddy, Traefik, Cloudflare Tunnel). Do not expose port 3000 directly.

### Images

`.github/workflows/mcp-server.yml` tests and builds the image for `linux/amd64` and `linux/arm64`:

| Trigger | Image tags |
| --- | --- |
| Push/merge to `develop` touching `mcp-server/` | `ghcr.io/pajoma/journal-mcp:dev`, `:sha-<short>` |
| Tag `mcp-server-v0.1.0` | `:0.1.0`, `:latest` |
| Pull request | tests only |

Update to the latest dev build: `docker compose pull && docker compose up -d`. Pin a build: `JOURNAL_MCP_IMAGE=ghcr.io/pajoma/journal-mcp:sha-abc1234` in `.env`.

A new GHCR package starts out private. Either make it public (*Packages → journal-mcp → Package settings*; the image contains no secrets or journal data) or `docker login ghcr.io` on the host with a personal access token limited to `read:packages`.

Build locally (Docker or Podman): `podman build --format docker -t journal-mcp:local .` and `JOURNAL_MCP_IMAGE=localhost/journal-mcp:local`. Podman needs `--format docker` to keep the `HEALTHCHECK`.

### Synchronisation with git-sync

The image contains [git-sync](https://github.com/simonthum/git-sync) (CC0, pinned to a commit, checksum verified). Every change via MCP runs:

1. `git-sync` before writing: fetch, fast-forward or rebase local commits, push. If this fails, nothing is written.
2. Change the file and commit only that file with a descriptive message (`journal(2026-10-09): add task`).
3. `git-sync` again: rebase onto remote changes made in the meantime, push. Never `--force`.

Reads sync at most every 30 seconds. The server sets `branch.<GIT_BRANCH>.sync=true` in the repository and checks that exactly this branch is checked out. Before every sync it verifies that `HEAD` exists and shares history with the remote; otherwise it refuses instead of letting git-sync auto-commit a broken state.

| Situation | Behaviour |
| --- | --- |
| GitHub unreachable | Error to the client; changes already committed are pushed on the next sync |
| Other files/lines changed elsewhere | Rebase, push, nothing to do |
| Real conflict | Rebase is aborted, local commits are kept, further writes are refused until resolved manually (`docker compose exec journal-mcp sh`, then fix in `/data/journal`) |

Do not edit `data/journal` from outside the container (file manager, SMB share, git on the host) while it runs. Two systems writing to the same `.git` can make git see inconsistent refs. Use `docker compose exec journal-mcp sh` for manual fixes.

Locally `GIT_SYNC` stays `false`; to use it anyway, point `GIT_SYNC_BIN` to the script.

## Authentication: static tokens

`MCP_AUTH_TOKEN` (full access) and optionally `MCP_WRITE_TOKEN` (add only), at least 32 characters each, checked on every request:

- header `Authorization: Bearer <token>` (Claude Code, VS Code, curl)
- or query parameter `https://<host>/mcp?token=<token>` for clients that only accept a URL (e.g. custom connectors in claude.ai/ChatGPT)

Tokens are passed at runtime via `.env`, not baked into the image: image layers are readable with `docker history`, and rotation would need a rebuild. Rotate by changing `.env` and running `docker compose up -d`.

The server never logs query strings, but reverse-proxy access logs often do — disable query logging there, or the token ends up in the log.

`/healthz` needs no token and only returns `ok`.
