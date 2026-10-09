/** MCP tools for scopes and scoped notes (see docs/specs/2026-10-09-scopes-as-folders.md). */
import { readdir } from "node:fs/promises";
import path from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type moment from "moment";
import { z } from "zod";

import type { Config } from "./config.js";
import * as journal from "./journal.js";
import { type Scope, SCOPE_NAME, Scopes } from "./scopes.js";
import type { JournalStore } from "./store.js";
import { replaceVariable, resolveDate } from "./template.js";

export interface ScopeToolContext {
  server: McpServer;
  store: JournalStore;
  cfg: Config;
  scopes: Scopes;
  policy: journal.Policy;
  full: boolean;
  run: (fn: () => Promise<unknown>) => Promise<CallToolResult>;
  now: () => moment.Moment;
  day: (value?: string) => string;
}

/** Links to notes in these folders count as private (relative links from entries, hence relative to the base). */
export function privateLinks(cfg: Config, scopes: Scopes): string[] {
  const dirs = [
    ...cfg.privateTags.map((t) => path.join(scopes.root(), t)),
    ...scopes
      .all()
      .filter((s) => s.private)
      .map((s) => s.dir),
  ];
  return [
    ...new Set(
      dirs.map(
        (d) =>
          path
            .relative(cfg.basePath, d)
            .split(path.sep)
            .filter((part) => part !== "..")
            .join("/") + "/",
      ),
    ),
  ];
}

export function registerScopeTools(ctx: ScopeToolContext): void {
  const { server, store, cfg, scopes, policy, full, run, now, day } = ctx;
  const { journal: settings } = cfg;
  const notesExt = `.${settings.ext}`;

  const scopeArg = z.string().describe("Scope name, with or without '#', e.g. 'vera'");
  const noteArg = z.string().describe("Note path relative to the scope folder, as returned by list_notes");

  /** A scope that may be written to (private scopes included). */
  const writable = (name: string): Scope => {
    const scope = scopes.get(name);
    if (!scope) throw new Error(`Unknown scope '${name}'. Create it with create_scope or check list_scopes.`);
    if (!scope.inRepo) throw new Error(`Scope '${scope.name}' is stored outside the journal repository`);
    return scope;
  };
  /** A scope that may be read; private scopes do not exist for readers. */
  const readable = (name: string): Scope => {
    const scope = scopes.get(name);
    if (!scope || scope.private || !scope.inRepo) throw new Error(`Unknown scope '${name}'`);
    return scope;
  };
  const isHidden = (text: string) => journal.readDocument(journal.toLines(text), policy).markdown === "";

  async function listFiles(dir: string, prefix = ""): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const result: string[] = [];
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name.startsWith("~")) continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) result.push(...(await listFiles(path.join(dir, e.name), rel)));
      else if (e.name.endsWith(notesExt)) result.push(rel);
    }
    return result.sort((a, b) => a.localeCompare(b));
  }

  /** Visible title of a note, undefined if the whole note is private. */
  const titleOf = (text: string, file: string): string | undefined => {
    const doc = journal.readDocument(journal.toLines(text), policy);
    if (!doc.markdown) return undefined;
    return doc.headings.find((h) => h.level === 1)?.text ?? path.basename(file, notesExt).replace(/_/g, " ");
  };

  // ----------------------------------------------------------------- read

  if (full) {
    server.registerTool(
      "list_scopes",
      {
        title: "List scopes",
        description: "Lists the scopes (projects/topics) notes can be stored in.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      () =>
        run(() =>
          store.synced(() =>
            scopes
              .all()
              .filter((s) => !s.private && s.inRepo)
              .map((s) => ({ name: s.name, source: s.source, folder: store.relative(s.dir) })),
          ),
        ),
    );

    server.registerTool(
      "list_notes",
      {
        title: "List notes",
        description: "Lists the notes of a scope (including sub-folders).",
        inputSchema: { scope: scopeArg },
        annotations: { readOnlyHint: true },
      },
      ({ scope: name }) =>
        run(async () => {
          const scope = readable(name);
          return store.synced(async () => {
            const notes = [];
            for (const note of await listFiles(scope.dir)) {
              const text = (await store.readRaw(store.relative(path.join(scope.dir, note)))) ?? "";
              const title = titleOf(text, note);
              if (title === undefined) continue;
              notes.push(cfg.notesReadable ? { note, title } : { note });
            }
            return { scope: scope.name, notes };
          });
        }),
    );

    server.registerTool(
      "get_note",
      {
        title: "Get note",
        description: "Returns the markdown of a note in a scope.",
        inputSchema: { scope: scopeArg, note: noteArg },
        annotations: { readOnlyHint: true },
      },
      ({ scope: name, note }) =>
        run(async () => {
          if (!cfg.notesReadable) throw new Error("Notes are not readable (server configuration)");
          const scope = readable(name);
          const text = await store.readFile(scopes.resolveNote(scope, note));
          const doc = text === undefined ? undefined : journal.readDocument(journal.toLines(text), policy);
          if (!doc?.markdown) throw new Error(`Note '${note}' not found in scope '${scope.name}'`);
          return { scope: scope.name, note, ...doc };
        }),
    );

    server.registerTool(
      "append_to_note",
      {
        title: "Append to note",
        description: "Appends markdown to a note in a scope, at the end or below an existing heading.",
        inputSchema: {
          scope: scopeArg,
          note: noteArg,
          content: z.string().describe("Markdown content"),
          heading: z.string().optional().describe("Existing heading of the note to append below"),
        },
      },
      ({ scope: name, note, content, heading }) =>
        run(async () => {
          const scope = readable(name);
          const file = scopes.resolveNote(scope, note);
          return store.transaction(`#${scope.name}`, `append to ${note}`, async (tx) => {
            const text = await tx.read(file);
            if (text === undefined || isHidden(text))
              throw new Error(`Note '${note}' not found in scope '${scope.name}'`);
            const lines = journal.toLines(text);
            journal.appendToDocument(lines, content, heading, policy, cfg.notesReadable);
            return { scope: scope.name, note, path: await tx.write(file, journal.fromLines(lines)) };
          });
        }),
    );
  }

  // ---------------------------------------------------------------- write

  server.registerTool(
    "create_scope",
    {
      title: "Create scope",
      description: "Creates a scope (a folder below the scope root) to store notes in.",
      inputSchema: { name: z.string().describe("Letters, digits, '_' and '-'; without '#'") },
    },
    ({ name }) =>
      run(async () => {
        const clean = name.trim().replace(/^#/, "");
        if (!SCOPE_NAME.test(clean)) throw new Error("Scope names may only contain letters, digits, '_' and '-'");
        const existing = await store.synced(() => scopes.get(clean));
        if (existing) return { name: existing.name, created: false };
        const marker = path.join(scopes.root(), clean, ".gitkeep");
        return store.transaction(`#${clean}`, "create scope", async (tx) => {
          await tx.write(marker, "");
          return { name: clean, created: true, folder: store.relative(path.dirname(marker)) };
        });
      }),
  );

  server.registerTool(
    "create_note",
    {
      title: "Create note",
      description:
        "Creates a new note (e.g. a concept) in a scope from the user's note template and links it from the daily entry. Never overwrites; use append_to_note to extend a note.",
      inputSchema: {
        scope: scopeArg,
        title: z.string().describe("Note title; also the file name"),
        content: z.string().describe("Markdown body of the note"),
        tags: z.array(z.string()).optional().describe("Additional tags, e.g. ['concept']"),
        link: z.boolean().optional().describe("Link the note from the daily entry (default true)"),
        date: z.string().optional().describe("Day whose entry links the note (default: today)"),
      },
    },
    ({ scope: name, title, content, tags = [], link = true, date }) =>
      run(async () => {
        const scope = await store.synced(() => writable(name));
        const time = now();
        const file = scopes.notePath(scope, title.trim(), time);
        const relToScope = path.relative(scope.dir, file).split(path.sep).join("/");
        const body = content.replace(/\r\n/g, "\n").trim();
        const tagLine = [scope.name, ...tags]
          .map((t) => `#${t.trim().replace(/^#/, "")}`)
          .filter((t) => t.length > 1)
          .join(" ");

        let text = settings.template("note", scope.name).template;
        text = replaceVariable(text, "input", title.trim());
        text = replaceVariable(text, "tags", tagLine);
        text = resolveDate(text, time).trimEnd();
        text = `${text}\n\n${body}\n`;

        return store.transaction(`#${scope.name}`, `note ${relToScope}`, async (tx) => {
          if ((await tx.read(file)) !== undefined) {
            throw new Error(`Note '${relToScope}' already exists in scope '${scope.name}'; use append_to_note`);
          }
          const notePath = await tx.write(file, text);
          let linked: string | undefined;
          if (link) {
            const entryId = { period: "daily" as const, date: day(date) };
            const lines = await tx.entry(entryId);
            const entryDir = path.dirname(path.join(cfg.repoPath, store.entryPath(entryId)));
            const target = path.relative(entryDir, file).split(path.sep).join("/").replace(/ /g, "%20");
            const files = settings.template("files");
            let line = replaceVariable(files.template, "title", path.basename(file, notesExt).replace(/_/g, " "));
            line = replaceVariable(line, "link", target);
            journal.addLink(lines, line, files.after, decodeURI(target));
            linked = store.entryPath(entryId);
          }
          return full ? { scope: scope.name, note: relToScope, path: notePath, linked_in: linked } : { created: true };
        });
      }),
  );
}
