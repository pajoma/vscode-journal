/**
 * Pure, line-based parsing and editing of a daily journal entry.
 *
 * Format (as written by vscode-journal and the time-tracker conventions):
 *
 *   # Wednesday, October 07 2026
 *   ## Tasks
 *   - [ ] open task
 *   - [x] done task
 *   ## Zeiterfassung
 *   | Von   | Bis   | Zeit  | Kunde/Projekt | Tätigkeit |
 *   |-------|-------|-------|---------------|-----------|
 *   | 09:00 | 11:30 | 2.5h  | Project       | Activity  |
 *   ## Notes
 *   ...everything below "## Notes" belongs to the notes area,
 *   including further "##" headings.
 *
 * Entries are addressed by temporary refs ("L<line>-<hash>") that are only
 * valid as long as the referenced line is unchanged.
 *
 * Content tagged as private (e.g. "## Topic #private", a tag line right below
 * a heading, or a single task/row containing the tag) is never returned and
 * cannot be addressed by refs.
 */
import { createHash } from "node:crypto";

import { formatTime, parseTime } from "./dates.js";
import { templatePattern } from "./template.js";

export class JournalError extends Error {}
export class StaleRefError extends JournalError {}

export type Lines = string[];

export interface Policy {
  /** Tags (without "#") marking content that is never returned. */
  privateTags: string[];
  /** Whether the notes area (content and headings) may be returned. */
  notesReadable: boolean;
}

export const DEFAULT_POLICY: Policy = { privateTags: ["private", "privat"], notesReadable: true };

const HEADING = /^(#{1,6})\s+(.*?)\s*$/;
const FENCE = /^\s*(```|~~~)/;
// open "[ ]" (also "[]" from the extension's default template), done "[x]", moved "[>]"
const CHECKBOX = /^(\s*)([-*+])\s?\[\s{0,2}(x|X|>)?\s{0,2}\]\s?(.*)$/;
const DONE_SUFFIX = /\s*\(done: [^)]*\)\s*$/;
const MOVED_SUFFIX = /\s*\(moved: [^)]*\)\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;
const TAGS_ONLY = /^\s*(#[\p{L}\p{N}_-]+\s*)+$/u;

const TASKS = /^(tasks|aufgaben)$/i;
const TIME = /^zeiterfassung$/i;
const NOTES = /^(notes|notizen)$/i;

export const TIME_HEADER = "| Von   | Bis   | Zeit  | Kunde/Projekt | Tätigkeit |";
export const TIME_SEPARATOR = "|-------|-------|-------|--------------|-----------|";

// ---------------------------------------------------------------- basics

export function toLines(content: string): Lines {
  return content.replace(/\r\n/g, "\n").split("\n");
}

export function fromLines(lines: Lines): string {
  const text = lines.join("\n");
  return text.endsWith("\n") ? text : `${text}\n`;
}

/** Lines of a new entry from the resolved `entry` template. */
export function newEntry(content: string): Lines {
  return toLines(content);
}

function hash(line: string): string {
  return createHash("sha256").update(line).digest("hex").slice(0, 8);
}

export function lineRef(lines: Lines, index: number): string {
  return `L${index + 1}-${hash(lines[index])}`;
}

function staleRef(ref: string): StaleRefError {
  return new StaleRefError(`Ref '${ref}' is stale, the entry changed. Read the day again and use the new ref.`);
}

export function resolveRef(lines: Lines, ref: string): number {
  const m = /^L(\d+)-([0-9a-f]{8})$/.exec(ref);
  if (!m) throw new JournalError(`Invalid ref '${ref}'`);
  const index = Number(m[1]) - 1;
  if (index < 0 || index >= lines.length || hash(lines[index]) !== m[2]) throw staleRef(ref);
  return index;
}

/** Like resolveRef, but hidden lines are indistinguishable from stale refs. */
function resolveVisibleRef(lines: Lines, ref: string, hidden: boolean[]): number {
  const index = resolveRef(lines, ref);
  if (hidden[index]) throw staleRef(ref);
  return index;
}

function singleLine(text: string, field: string): string {
  const value = text.replace(/\s*[\r\n]+\s*/g, " ").trim();
  if (!value) throw new JournalError(`'${field}' must not be empty`);
  return value;
}

/** Index after the last non-empty line (keeps the trailing newline out of the way). */
function contentEnd(lines: Lines, from = 0, to = lines.length): number {
  let end = to;
  while (end > from && lines[end - 1].trim() === "") end--;
  return end;
}

// -------------------------------------------------------------- structure

export interface Heading {
  index: number;
  level: number;
  text: string;
}

export function headings(lines: Lines): Heading[] {
  const result: Heading[] = [];
  let fenced = false;
  lines.forEach((line, index) => {
    if (FENCE.test(line)) fenced = !fenced;
    const m = fenced ? null : HEADING.exec(line);
    if (m) result.push({ index, level: m[1].length, text: m[2] });
  });
  return result;
}

interface Section {
  heading: Heading;
  /** First line after the section. */
  end: number;
}

function findSection(lines: Lines, name: RegExp): Section | undefined {
  const hs = headings(lines);
  const i = hs.findIndex((h) => h.level === 2 && name.test(h.text));
  if (i < 0) return undefined;
  const next = hs.slice(i + 1).find((h) => h.level <= 2);
  return { heading: hs[i], end: next ? next.index : lines.length };
}

/**
 * The notes area runs from "## Notes" to the end of the file (sub-topics often
 * use "##" too), unless a Tasks or Zeiterfassung section follows it.
 */
function notesSection(lines: Lines): Section | undefined {
  const section = findSection(lines, NOTES);
  if (!section) return undefined;
  const next = headings(lines).find(
    (h) => h.index > section.heading.index && h.level <= 2 && (TASKS.test(h.text) || TIME.test(h.text)),
  );
  return { ...section, end: next ? next.index : lines.length };
}

/** Nearest heading above each line (null before the first heading). */
function headingContext(lines: Lines): (Heading | null)[] {
  const hs = headings(lines);
  const context: (Heading | null)[] = [];
  let h = 0;
  let current: Heading | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (h < hs.length && hs[h].index === i) current = hs[h++];
    context.push(current);
  }
  return context;
}

// ---------------------------------------------------------------- privacy

function tagPattern(tags: string[]): RegExp | null {
  const names = tags.map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
  if (!names.length) return null;
  const alternatives = names.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`(^|\\s)#(${alternatives})(?![\\p{L}\\p{N}_-])`, "iu");
}

/** Lines that must never leave the server because they are tagged private. */
export function privateMask(lines: Lines, policy: Policy): boolean[] {
  const mask = lines.map(() => false);
  const tag = tagPattern(policy.privateTags);
  if (!tag) return mask;
  const hs = headings(lines);
  hs.forEach((h, k) => {
    const nextAny = k + 1 < hs.length ? hs[k + 1].index : lines.length;
    const firstLine = lines.slice(h.index + 1, nextAny).find((l) => l.trim() !== "");
    const tagged = tag.test(h.text) || (firstLine !== undefined && TAGS_ONLY.test(firstLine) && tag.test(firstLine));
    if (!tagged) return;
    const next = hs.slice(k + 1).find((n) => n.level <= h.level);
    for (let i = h.index; i < (next ? next.index : lines.length); i++) mask[i] = true;
  });
  lines.forEach((line, i) => {
    if (tag.test(line)) mask[i] = true;
  });
  return mask;
}

/** Private lines, plus the notes area if notes must not be read. */
function hiddenMask(lines: Lines, policy: Policy): boolean[] {
  const mask = privateMask(lines, policy);
  const notes = policy.notesReadable ? undefined : notesSection(lines);
  if (notes) for (let i = notes.heading.index; i < notes.end; i++) mask[i] = true;
  return mask;
}

// ------------------------------------------------------------- insertion

/**
 * Inserts a line the way the extension's templates place content: below the
 * template's `after` anchor, or directly below the title if it has none.
 * Lines of the same kind are kept together (new ones go after existing ones).
 */
function insertLine(lines: Lines, line: string, after: string, sameKind: (l: string) => boolean): number {
  const exact = after ? lines.findIndex((l) => l.trim() === after.trim()) : -1;
  const anchor = exact >= 0 || !after ? exact : lines.findIndex((l) => l.includes(after));

  if (after && anchor < 0 && after.trimStart().startsWith("#")) {
    // the anchor heading is missing: create it below the title
    const title = headings(lines).find((h) => h.level === 1);
    if (!title) {
      lines.splice(0, 0, after.trim(), line, "");
      return 1;
    }
    lines.splice(title.index + 1, 0, "", after.trim(), line);
    return title.index + 3;
  }

  const heading = anchor >= 0 ? HEADING.exec(lines[anchor]) : null;
  if (heading && heading[1].length > 1) {
    // section anchor: after the last line of the same kind in that section
    const level = heading[1].length;
    const next = headings(lines).find((h) => h.index > anchor && h.level <= level);
    let at = anchor + 1;
    for (let i = at; i < (next ? next.index : lines.length); i++) {
      if (sameKind(lines[i])) at = i + 1;
    }
    lines.splice(at, 0, line);
    return at;
  }

  // below the title (or a non-heading anchor), grouped with lines of the same kind
  const first = headings(lines)[0];
  const top = anchor >= 0 ? anchor : first?.level === 1 ? first.index : -1;
  let at = top + 1;
  while (at < lines.length && lines[at].trim() === "") at++;
  if (!sameKind(lines[at] ?? "")) at = top + 1;
  while (at < lines.length && sameKind(lines[at])) at++;
  lines.splice(at, 0, line);
  if (top >= 0 && at === top + 1) lines.splice(at++, 0, "");
  if (lines[at + 1] !== undefined && lines[at + 1].trim() !== "" && !sameKind(lines[at + 1])) {
    lines.splice(at + 1, 0, "");
  }
  return at;
}

// ------------------------------------------------------------------ tasks

export type TaskStatus = "open" | "done" | "moved";

export interface Task {
  ref: string;
  status: TaskStatus;
  text: string;
  /** Heading the task is listed under. */
  section: string | null;
}

function taskStatus(mark: string | undefined): TaskStatus {
  if (mark === ">") return "moved";
  return mark === "x" || mark === "X" ? "done" : "open";
}

function isTask(line: string): boolean {
  const m = CHECKBOX.exec(line);
  return !!m && m[4].trim() !== "";
}

export function listTasks(lines: Lines, policy: Policy = DEFAULT_POLICY): Task[] {
  const hidden = hiddenMask(lines, policy);
  const context = headingContext(lines);
  const tasks: Task[] = [];
  let fenced = false;
  lines.forEach((line, i) => {
    if (FENCE.test(line)) fenced = !fenced;
    const m = fenced || hidden[i] ? null : CHECKBOX.exec(line);
    if (m && m[4].trim()) {
      tasks.push({
        ref: lineRef(lines, i),
        status: taskStatus(m[3]),
        text: m[4].trim(),
        section: context[i]?.text ?? null,
      });
    }
  });
  return tasks;
}

/** Inserts a task line rendered from the `task` template. */
export function addTask(lines: Lines, taskLine: string, after: string): string {
  const line = singleLine(taskLine, "task");
  if (!isTask(line)) throw new JournalError("The task template must produce a markdown checkbox ('- [ ] ...')");
  return lineRef(lines, insertLine(lines, line, after, isTask));
}

/** Completes ("[x]" + "(done: <now>)", like the extension's code action), reopens or rewords a task. */
export function updateTask(
  lines: Lines,
  ref: string,
  change: { done?: boolean; text?: string },
  now: string,
  policy: Policy = DEFAULT_POLICY,
): string {
  const i = resolveVisibleRef(lines, ref, hiddenMask(lines, policy));
  const m = CHECKBOX.exec(lines[i]);
  if (!m) throw new JournalError(`Ref '${ref}' does not point to a task`);
  const status = taskStatus(m[3]);
  const done = change.done ?? status === "done";
  let content = change.text !== undefined ? singleLine(change.text, "text") : m[4].trim();
  const doneSuffix = DONE_SUFFIX.exec(m[4])?.[0].trim();
  content = content.replace(DONE_SUFFIX, "");
  if (done) content += ` ${status === "done" && doneSuffix ? doneSuffix : `(done: ${now})`}`;
  const mark = done ? "x" : status === "moved" && change.done === undefined ? ">" : " ";
  lines[i] = `${m[1]}${m[2]} [${mark}] ${content}`;
  return lineRef(lines, i);
}

/** Task text without checkbox, template decoration and done/moved suffixes. */
export function taskText(line: string, taskTemplate: string): string {
  const m = CHECKBOX.exec(line);
  let content = (m ? m[4] : line).replace(DONE_SUFFIX, "").replace(MOVED_SUFFIX, "").trim();
  const tpl = CHECKBOX.exec(taskTemplate.split("\n")[0]);
  const input = templatePattern(tpl ? tpl[4] : taskTemplate).exec(content)?.[1];
  if (input?.trim()) content = input.trim();
  return content;
}

/**
 * Marks an open task as moved ("[>]" + "(moved: <date>)", like the extension's
 * "Plan for ..." code action) and returns its text for the target entry.
 */
export function markTaskMoved(
  lines: Lines,
  ref: string,
  target: string,
  taskTemplate: string,
  policy: Policy = DEFAULT_POLICY,
): string {
  const i = resolveVisibleRef(lines, ref, hiddenMask(lines, policy));
  const m = CHECKBOX.exec(lines[i]);
  if (!m) throw new JournalError(`Ref '${ref}' does not point to a task`);
  if (taskStatus(m[3]) !== "open") throw new JournalError(`Task '${ref}' is not open`);
  const text = taskText(lines[i], taskTemplate);
  lines[i] = `${m[1]}${m[2]} [>] ${m[4].trim()} (moved: ${target})`;
  return text;
}

// ------------------------------------------------------------------ memos

export interface Memo {
  ref: string;
  text: string;
}

export function listMemos(lines: Lines, memoTemplate: string, policy: Policy = DEFAULT_POLICY): Memo[] {
  const pattern = templatePattern(memoTemplate);
  const hidden = hiddenMask(lines, policy);
  const memos: Memo[] = [];
  lines.forEach((line, i) => {
    const m = hidden[i] || isTask(line) ? null : pattern.exec(line);
    if (m) memos.push({ ref: lineRef(lines, i), text: (m[1] ?? line).trim() });
  });
  return memos;
}

/** Inserts a memo line rendered from the `memo` template. */
export function addMemo(lines: Lines, memoLine: string, after: string, memoTemplate: string): string {
  const pattern = templatePattern(memoTemplate);
  const line = singleLine(memoLine, "memo");
  return lineRef(
    lines,
    insertLine(lines, line, after, (l) => pattern.test(l) && !isTask(l)),
  );
}

// ----------------------------------------------------------- time entries

export interface TimeEntry {
  ref: string;
  start: string;
  end: string;
  hours: number | null;
  project: string;
  description: string;
}

export interface TimeInput {
  start: string;
  end: string;
  project: string;
  description: string;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function formatHours(minutes: number): string {
  const h = minutes / 60;
  return `${Number.isInteger(h * 2) ? h.toFixed(1) : h.toFixed(2)}h`;
}

/** All data rows of the Zeiterfassung table, private ones included. */
function timeRows(lines: Lines): number[] {
  const section = findSection(lines, TIME);
  if (!section) return [];
  const rows: number[] = [];
  let header = true;
  for (let i = section.heading.index + 1; i < section.end; i++) {
    if (!TABLE_ROW.test(lines[i])) continue;
    if (TABLE_SEPARATOR.test(lines[i])) {
      header = false;
    } else if (!header) {
      rows.push(i);
    }
  }
  return rows;
}

function parseRow(lines: Lines, i: number): TimeEntry {
  const [start = "", end = "", zeit = "", project = "", description = ""] = splitRow(lines[i]);
  const hours = Number.parseFloat(zeit.replace(",", "."));
  return { ref: lineRef(lines, i), start, end, hours: Number.isNaN(hours) ? null : hours, project, description };
}

export function listTimeEntries(lines: Lines, policy: Policy = DEFAULT_POLICY): TimeEntry[] {
  const hidden = privateMask(lines, policy);
  return timeRows(lines)
    .filter((i) => !hidden[i])
    .map((i) => parseRow(lines, i));
}

function buildRow(input: TimeInput): { row: string; startMin: number; endMin: number } {
  const startMin = parseTime(input.start);
  const endMin = parseTime(input.end);
  if (endMin <= startMin) throw new JournalError(`End ${input.end} must be after start ${input.start}`);
  const row = `| ${formatTime(startMin)} | ${formatTime(endMin)} | ${formatHours(endMin - startMin)} | ${cell(
    singleLine(input.project, "project"),
  )} | ${cell(singleLine(input.description, "description"))} |`;
  return { row, startMin, endMin };
}

function overlaps(lines: Lines, policy: Policy, startMin: number, endMin: number, skip?: number): string[] {
  const hidden = privateMask(lines, policy);
  return timeRows(lines)
    .filter((i) => i !== skip && !hidden[i])
    .map((i) => parseRow(lines, i))
    .filter((e) => {
      try {
        return parseTime(e.start) < endMin && startMin < parseTime(e.end);
      } catch {
        return false;
      }
    })
    .map((e) => `Overlaps ${e.start}-${e.end} ${e.project} (${e.description})`);
}

export function addTimeEntry(
  lines: Lines,
  input: TimeInput,
  policy: Policy = DEFAULT_POLICY,
): { ref: string; warnings: string[] } {
  const { row, startMin, endMin } = buildRow(input);
  const warnings = overlaps(lines, policy, startMin, endMin);
  const section = findSection(lines, TIME);
  let at: number;
  if (!section) {
    const notes = notesSection(lines);
    let before = notes ? notes.heading.index : contentEnd(lines);
    lines.splice(before, 0, "## Zeiterfassung", "", TIME_HEADER, TIME_SEPARATOR, row, "");
    if (before > 0 && lines[before - 1].trim() !== "") lines.splice(before++, 0, "");
    at = before + 4;
  } else {
    const rows = timeRows(lines);
    if (rows.length === 0) {
      at = section.heading.index + 1;
      lines.splice(at, 0, "", TIME_HEADER, TIME_SEPARATOR, row);
      at += 3;
    } else {
      // keep rows ordered by start time
      const later = rows.find((i) => {
        try {
          return parseTime(parseRow(lines, i).start) > startMin;
        } catch {
          return false;
        }
      });
      at = later ?? rows[rows.length - 1] + 1;
      lines.splice(at, 0, row);
    }
  }
  return { ref: lineRef(lines, at), warnings };
}

export function updateTimeEntry(
  lines: Lines,
  ref: string,
  change: Partial<TimeInput>,
  policy: Policy = DEFAULT_POLICY,
): { ref: string; warnings: string[] } {
  const i = resolveVisibleRef(lines, ref, privateMask(lines, policy));
  if (!timeRows(lines).includes(i)) throw new JournalError(`Ref '${ref}' does not point to a time entry`);
  const current = parseRow(lines, i);
  const { row, startMin, endMin } = buildRow({
    start: change.start ?? current.start,
    end: change.end ?? current.end,
    project: change.project ?? current.project,
    description: change.description ?? current.description,
  });
  lines[i] = row;
  return { ref: lineRef(lines, i), warnings: overlaps(lines, policy, startMin, endMin, i) };
}

// ------------------------------------------------------------------ notes

export interface NoteHeading {
  level: number;
  text: string;
}

export function readNotes(
  lines: Lines,
  policy: Policy = DEFAULT_POLICY,
): { headings: NoteHeading[]; markdown: string } {
  const section = notesSection(lines);
  if (!section || !policy.notesReadable) return { headings: [], markdown: "" };
  const hidden = privateMask(lines, policy);
  const start = section.heading.index + 1;
  return {
    headings: headings(lines)
      .filter((h) => h.index > section.heading.index && h.index < section.end && !hidden[h.index])
      .map(({ level, text }) => ({ level, text })),
    markdown: lines
      .slice(start, section.end)
      .filter((_, k) => !hidden[start + k])
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  };
}

function contentLines(content: string): string[] {
  const text = content.replace(/\r\n/g, "\n").replace(/^\n+|\s+$/g, "");
  if (!text) throw new JournalError("'content' must not be empty");
  return text.split("\n");
}

export function addNote(
  lines: Lines,
  content: string,
  heading?: string,
  level = 2,
  policy: Policy = DEFAULT_POLICY,
): void {
  const block = contentLines(content);
  if (heading !== undefined) {
    block.unshift(`${"#".repeat(Math.min(Math.max(level, 2), 6))} ${singleLine(heading, "heading")}`, "");
  }
  let notes = notesSection(lines);
  if (!notes) {
    lines.splice(contentEnd(lines));
    lines.push("", "## Notes", "");
    notes = notesSection(lines)!;
  }
  // never append into a trailing private block, the new note would vanish in it
  const hidden = privateMask(lines, policy);
  let at = contentEnd(lines, notes.heading.index + 1, notes.end);
  while (at > notes.heading.index + 1 && hidden[at - 1]) at--;
  at = contentEnd(lines, notes.heading.index + 1, at);
  const rest = lines.splice(at);
  lines.push("", ...block, "");
  // re-attach what followed the notes area (e.g. a trailing Zeiterfassung)
  const tail = rest.slice(rest.findIndex((l) => l.trim() !== ""));
  if (rest.some((l) => l.trim() !== "")) lines.push(...tail);
}

export function appendNote(lines: Lines, heading: string, content: string, policy: Policy = DEFAULT_POLICY): void {
  const body = contentLines(content);
  const section = notesSection(lines);
  if (!section) throw new JournalError("The entry has no notes section");
  const hidden = privateMask(lines, policy);
  const all = headings(lines).filter((h) => h.index > section.heading.index && h.index < section.end);
  const visible = all.filter((h) => !hidden[h.index]);
  const wanted = singleLine(heading, "heading")
    .replace(/^#+\s*/, "")
    .toLowerCase();
  const matches = visible.filter((h) => h.text.toLowerCase() === wanted);
  if (matches.length !== 1) {
    // listing headings would reveal note content
    const available = policy.notesReadable
      ? ` Available: ${visible.map((h) => `"${h.text}"`).join(", ") || "none"}`
      : "";
    throw new JournalError(
      matches.length === 0
        ? `No note heading '${heading}'.${available}`
        : `Heading '${heading}' occurs ${matches.length} times, it cannot be identified uniquely`,
    );
  }
  const target = matches[0];
  // stop before private sub-sections, too
  const next = all.find((h) => h.index > target.index && (h.level <= target.level || hidden[h.index]));
  const at = contentEnd(lines, target.index + 1, next ? next.index : section.end);
  lines.splice(at, 0, "", ...body);
  if (lines[at + body.length + 1] !== undefined && lines[at + body.length + 1].trim() !== "") {
    lines.splice(at + body.length + 1, 0, "");
  }
}
