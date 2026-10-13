# Use your journal with AI assistants (MCP)

The extension comes with the journal MCP server: AI assistants can read your entries, add tasks, memos, time entries and notes, and move tasks, in your journal's format. It runs on VS Code's own Node.js, so nothing else needs to be installed. The tools are described in the [MCP server's README](../mcp-server/README.md#tools).

The server is **off by default**. Turn on `journal.mcp.enabled` in your user settings, or run **Journal: Set up MCP Server**, which asks to turn it on. Turning it off again stops the server for every assistant, including those set up before: it refuses to start.

## GitHub Copilot

Once the server is on, Copilot (agent mode) finds it as **Journal** in **MCP: List Servers**, without further setup. It uses the settings of the window, workspace settings included, and restarts when you change a `journal.*` setting.

## Claude Code, Codex and other assistants

Run **Journal: Set up MCP Server** and pick the assistant:

| Assistant | What the command does |
|-----------|-----------------------|
| Claude Code | Shows `claude mcp add --scope user journal -- <start script>` and runs it in a terminal if the `claude` command is installed. The Claude Code VS Code extension doesn't install that command: copy the line into a terminal where Claude Code is installed, or type `/mcp` in the Claude Code chat panel and add a server named `journal` with the start script as command. Both reach the CLI and the VS Code extension. |
| Codex | Shows `codex mcp add journal -- <start script>` (run in a terminal if `codex` is installed), or the block for `~/.codex/config.toml`. The Codex CLI, IDE extension and app share this configuration. |
| Other (Claude Desktop, Cursor, Gemini CLI, …) | Opens and copies the `mcpServers` JSON block for the assistant's configuration file. |

The command never changes another assistant's configuration without your click.

The start script (`journal-mcp`, on Windows `journal-mcp.cmd`, started via `cmd /c`) lies in the extension's global storage folder. The extension rewrites it, the server it starts and the settings it reads whenever VS Code starts, so updates of the extension or of VS Code need no new setup. If you moved or reinstalled VS Code, start it once and the script points to the new location.

These assistants use your **user** settings (`journal.base`, templates, scopes …), not workspace settings: they run outside of any VS Code window. Changes reach them the next time they start the server. For the same reason `journal.base`, `journal.scopeRoot` and the bases in `journal.scopes` must not use `${workspaceFolder}` in your user settings: the setup command then asks for an absolute path, and an assistant set up before can't start the server (instead of writing somewhere else).

## Good to know

* **Notes:** the server does not return the notes area of entries (`NOTES_READABLE`, see the [MCP server's README](../mcp-server/README.md#privacy)). For assistants set up with the command you can pass it: `claude mcp add --scope user journal -e NOTES_READABLE=true -- <start script>`.
* **Private content:** lines, sections and files tagged `#private` are never returned.
* **Today** is today in your computer's time zone.
* **After an extension update** assistants run the previous server version until VS Code has started once with the new version.
* **After uninstalling** the extension, remove the assistant's entry, e.g. `claude mcp remove journal` or `codex mcp remove journal`.
* **Remote windows (SSH, WSL, containers):** Copilot runs the server where the extension runs. The setup command describes the remote machine; set up assistants that run there.
* **Running the server yourself** (container on a NAS, development): see the [MCP server's README](../mcp-server/README.md).
