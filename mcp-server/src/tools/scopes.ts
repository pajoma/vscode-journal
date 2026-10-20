/** MCP tools for scopes and scoped notes (see docs/specs/2026-10-09-scopes-as-folders.md). */
import { readdir } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import * as journal from "../journal/index.js";
import { noteLink, renderNote, type Scope, SCOPE_NAME, uniqueFile } from "../scopes.js";
import { adding, run, type Tool, type ToolContext } from "./context.js";

const scopeArg = z.string().describe("Scope name, with or without '#', e.g. 'vera'");
const noteArg = z.string().describe("Note path relative to the scope folder, as returned by list_notes");

/** A scope that may be written to (private scopes included). */
function writable(ctx: ToolContext, name: string): Scope {
  const scope = ctx.scopes.get(name);
  if (!scope) throw new Error(`Unknown scope '${name}'. Create it with create_scope or check list_scopes.`);
  if (!scope.inRepo) throw new Error(`Scope '${scope.name}' is stored outside the journal repository`);
  return scope;
}

/** A scope that may be read; private scopes do not exist for readers. */
function readable(ctx: ToolContext, name: string): Scope {
  const scope = ctx.scopes.get(name);
  if (!scope || scope.private || !scope.inRepo) throw new Error(`Unknown scope '${name}'`);
  return scope;
}

const notesExt = (ctx: ToolContext) => `.${ctx.cfg.journal.getFileExtension()}`;

const isHidden = (ctx: ToolContext, text: string) =>
  journal.readDocument(ctx.view(journal.toLines(text))).markdown === "";

/** The note files below a folder, relative to it, sorted. */
async function listFiles(dir: string, ext: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const result: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name.startsWith("~")) continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) result.push(...(await listFiles(path.join(dir, e.name), ext, rel)));
    else if (e.name.endsWith(ext)) result.push(rel);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

/** Visible title of a note, undefined if the whole note is private. */
function titleOf(ctx: ToolContext, text: string, file: string): string | undefined {
  const doc = journal.readDocument(ctx.view(journal.toLines(text)));
  if (!doc.markdown) return undefined;
  return doc.headings.find((h) => h.level === 1)?.text ?? path.basename(file, notesExt(ctx)).replace(/_/g, " ");
}

// ----------------------------------------------------------------- read

function listScopes(ctx: ToolContext): void {
  ctx.server.registerTool(
    "list_scopes",
    {
      title: "List scopes",
      description: "Lists the scopes (projects/topics) notes can be stored in.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      run(() =>
        ctx.store.synced(() =>
          ctx.scopes
            .all()
            .filter((s) => !s.private && s.inRepo)
            .map((s) => ({ name: s.name, source: s.source, folder: ctx.store.relative(s.dir) })),
        ),
      ),
  );
}

function listNotes(ctx: ToolContext): void {
  ctx.server.registerTool(
    "list_notes",
    {
      title: "List notes",
      description: "Lists the notes of a scope (including sub-folders).",
      inputSchema: { scope: scopeArg },
      annotations: { readOnlyHint: true },
    },
    ({ scope: name }) =>
      run(async () => {
        const scope = readable(ctx, name);
        const files = await ctx.store.synced(() => listFiles(scope.dir, notesExt(ctx)));
        const texts = await ctx.store.readFiles(files.map((note) => path.join(scope.dir, note)));
        const notes = [];
        for (const [i, note] of files.entries()) {
          const title = titleOf(ctx, texts[i] ?? "", note);
          if (title === undefined) continue;
          notes.push(ctx.cfg.notesReadable ? { note, title } : { note });
        }
        return { scope: scope.name, notes };
      }),
  );
}

function getNote(ctx: ToolContext): void {
  ctx.server.registerTool(
    "get_note",
    {
      title: "Get note",
      description: "Returns the markdown of a note in a scope.",
      inputSchema: { scope: scopeArg, note: noteArg },
      annotations: { readOnlyHint: true },
    },
    ({ scope: name, note }) =>
      run(async () => {
        if (!ctx.cfg.notesReadable) throw new Error("Notes are not readable (server configuration)");
        const scope = readable(ctx, name);
        const text = await ctx.store.readFile(ctx.scopes.resolveNote(scope, note));
        const doc = text === undefined ? undefined : journal.readDocument(ctx.view(journal.toLines(text)));
        if (!doc?.markdown) throw new Error(`Note '${note}' not found in scope '${scope.name}'`);
        return { scope: scope.name, note, ...doc };
      }),
  );
}

function appendToNote(ctx: ToolContext): void {
  ctx.server.registerTool(
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
        const scope = readable(ctx, name);
        const file = ctx.scopes.resolveNote(scope, note);
        return ctx.store.transaction(`#${scope.name}`, `append to ${note}`, async (tx) => {
          const text = await tx.read(file);
          if (text === undefined || isHidden(ctx, text))
            throw new Error(`Note '${note}' not found in scope '${scope.name}'`);
          const lines = journal.toLines(text);
          journal.appendToDocument(ctx.view(lines), content, heading);
          return { scope: scope.name, note, path: await tx.write(file, journal.fromLines(lines)) };
        });
      }),
  );
}

// ---------------------------------------------------------------- write

function createScope(ctx: ToolContext): void {
  ctx.server.registerTool(
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
        const existing = await ctx.store.synced(() => ctx.scopes.get(clean));
        if (existing) return { name: existing.name, created: false };
        const marker = path.join(ctx.scopes.root(), clean, ".gitkeep");
        return ctx.store.transaction(`#${clean}`, "create scope", async (tx) => {
          await tx.write(marker, "");
          return { name: clean, created: true, folder: ctx.store.relative(path.dirname(marker)) };
        });
      }),
  );
}

const createNoteArgs = {
  scope: scopeArg,
  title: z.string().describe("Note title; also the file name"),
  content: z.string().describe("Markdown body of the note"),
  tags: z.array(z.string()).optional().describe("Additional tags, e.g. ['concept']"),
  link: z.boolean().optional().describe("Link the note from the daily entry (default true)"),
  date: z.string().optional().describe("Day whose entry links the note (default: today)"),
};
type CreateNoteInput = z.infer<z.ZodObject<typeof createNoteArgs>>;

function createNote(ctx: ToolContext): void {
  ctx.server.registerTool(
    "create_note",
    {
      title: "Create note",
      description:
        "Creates a new note (e.g. a concept) in a scope from the user's note template and links it from the daily entry. Never overwrites; use append_to_note to extend a note.",
      inputSchema: createNoteArgs,
    },
    (input) => run(() => storeNote(ctx, input)),
  );
}

/** Writes a new note (a free name in a private scope instead of an error) and links it from the day's entry. */
async function storeNote(ctx: ToolContext, input: CreateNoteInput) {
  const { store, scopes, cfg } = ctx;
  const { title, content, tags = [], link = true, date } = input;
  const settings = cfg.journal;
  const scope = await store.synced(() => writable(ctx, input.scope));
  const time = ctx.now();
  const text = renderNote(settings.getNotesTemplate(scope.name).template, title, [scope.name, ...tags], content, time);

  return store.transaction(`#${scope.name}`, "add note", async (tx) => {
    let file = scopes.notePath(scope, title.trim(), time);
    const exists = async (f: string) => (await tx.read(f)) !== undefined;
    if (await exists(file)) {
      // a private scope must not reveal which notes exist: store under a free name instead
      if (!scope.private) {
        const existing = path.relative(scope.dir, file).split(path.sep).join("/");
        throw new Error(`Note '${existing}' already exists in scope '${scope.name}'; use append_to_note`);
      }
      file = await uniqueFile(file, exists);
    }
    const notePath = await tx.write(file, text);
    let linked: string | undefined;
    if (link) {
      const entryId = { period: "daily" as const, date: ctx.day(date) };
      const entryPath = await store.locate(entryId);
      const entryDir = path.dirname(path.join(cfg.repoPath, entryPath));
      const files = settings.getFileLinkInlineTemplate();
      const { line, link: target } = noteLink(files.template, entryDir, file, settings.getFileExtension());
      journal.addLink(await tx.entry(entryId), line, files.after, target);
      linked = entryPath;
    }
    if (!ctx.full || scope.private) return { created: true };
    const note = path.relative(scope.dir, file).split(path.sep).join("/");
    return { scope: scope.name, note, path: notePath, linked_in: linked };
  });
}

/** Scope tools; a write-only token may only create scopes and notes. */
export const scopeTools: Tool[] = [listScopes, listNotes, getNote, appendToNote, adding(createScope), adding(createNote)];
