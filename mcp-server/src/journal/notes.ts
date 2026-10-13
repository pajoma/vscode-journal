/** The notes area of entries ("## Notes" …) and whole note files of scopes. */
import { contentEnd, contentLines, JournalError, type Lines, singleLine } from "./lines.js";
import type { VisibleLines } from "./privacy.js";
import { headings, notesSection } from "./structure.js";

export interface NoteHeading {
  level: number;
  text: string;
}

export interface NoteContent {
  headings: NoteHeading[];
  markdown: string;
}

/** Visible headings and markdown between `from` and `to`. */
function visibleContent(lines: Lines, hidden: boolean[], from: number, to: number): NoteContent {
  return {
    headings: headings(lines)
      .filter((h) => h.index >= from && h.index < to && !hidden[h.index])
      .map(({ level, text }) => ({ level, text })),
    markdown: lines
      .slice(from, to)
      .filter((_, k) => !hidden[from + k])
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  };
}

/** Notes area of an entry; empty when notes are not readable. */
export function readNotes(view: VisibleLines): NoteContent {
  const section = notesSection(view.lines);
  if (!section || !view.notesReadable) return { headings: [], markdown: "" };
  return visibleContent(view.lines, view.privateMask(), section.heading.index + 1, section.end);
}

/** Appends a note (optionally under a new heading) to the end of the notes area. */
export function addNote(view: VisibleLines, content: string, heading?: string, level = 2): void {
  const { lines } = view;
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
  const hidden = view.privateMask();
  let at = contentEnd(lines, notes.heading.index + 1, notes.end);
  while (at > notes.heading.index + 1 && hidden[at - 1]) at--;
  at = contentEnd(lines, notes.heading.index + 1, at);
  const rest = lines.splice(at);
  lines.push("", ...block, "");
  // re-attach what followed the notes area (e.g. a trailing Zeiterfassung)
  const tail = rest.slice(rest.findIndex((l) => l.trim() !== ""));
  if (rest.some((l) => l.trim() !== "")) lines.push(...tail);
}

/** Appends below an existing heading of the notes area. */
export function appendNote(view: VisibleLines, heading: string, content: string): void {
  const section = notesSection(view.lines);
  if (!section) throw new JournalError("The entry has no notes section");
  appendUnderHeading(view, heading, content, section.heading.index + 1, section.end);
}

/**
 * Appends below the block of a unique, non-private heading between `from` and
 * `to`. Available headings are only listed in errors if notes are readable.
 */
function appendUnderHeading(view: VisibleLines, heading: string, content: string, from: number, to: number): void {
  const { lines } = view;
  const body = contentLines(content);
  const hidden = view.privateMask();
  const all = headings(lines).filter((h) => h.index >= from && h.index < to);
  const candidates = all.filter((h) => !hidden[h.index]);
  const wanted = singleLine(heading, "heading")
    .replace(/^#+\s*/, "")
    .toLowerCase();
  const matches = candidates.filter((h) => h.text.toLowerCase() === wanted);
  if (matches.length !== 1) {
    // listing headings would reveal content that must not be read
    const available = view.notesReadable
      ? ` Available: ${candidates.map((h) => `"${h.text}"`).join(", ") || "none"}`
      : "";
    throw new JournalError(
      matches.length === 0
        ? `No heading '${heading}'.${available}`
        : `Heading '${heading}' occurs ${matches.length} times, it cannot be identified uniquely`,
    );
  }
  const target = matches[0];
  // stop before private sub-sections, too
  const next = all.find((h) => h.index > target.index && (h.level <= target.level || hidden[h.index]));
  const at = contentEnd(lines, target.index + 1, next ? next.index : to);
  lines.splice(at, 0, "", ...body);
  if (lines[at + body.length + 1] !== undefined && lines[at + body.length + 1].trim() !== "") {
    lines.splice(at + body.length + 1, 0, "");
  }
}

/** Visible markdown of a note file; private sections and lines are removed. */
export function readDocument(view: VisibleLines): NoteContent {
  return visibleContent(view.lines, view.privateMask(), 0, view.lines.length);
}

/** Appends to a note file: below an existing heading, or at the end (before a trailing private block). */
export function appendToDocument(view: VisibleLines, content: string, heading?: string): void {
  const { lines } = view;
  if (heading !== undefined) {
    appendUnderHeading(view, heading, content, 0, lines.length);
    return;
  }
  const body = contentLines(content);
  const hidden = view.privateMask();
  let at = contentEnd(lines);
  while (at > 0 && hidden[at - 1]) at--;
  at = contentEnd(lines, 0, at);
  const rest = lines.splice(at);
  lines.push(...(at > 0 ? [""] : []), ...body, "");
  if (rest.some((l) => l.trim() !== "")) lines.push(...rest.slice(rest.findIndex((l) => l.trim() !== "")));
}
