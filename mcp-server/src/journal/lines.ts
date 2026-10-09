/** Lines of a markdown file, refs to single lines, small text helpers. */
import { createHash } from "node:crypto";

export class JournalError extends Error {}
export class StaleRefError extends JournalError {}

export type Lines = string[];

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

export function staleRef(ref: string): StaleRefError {
  return new StaleRefError(`Ref '${ref}' is stale, the entry changed. Read the day again and use the new ref.`);
}

export function resolveRef(lines: Lines, ref: string): number {
  const m = /^L(\d+)-([0-9a-f]{8})$/.exec(ref);
  if (!m) throw new JournalError(`Invalid ref '${ref}'`);
  const index = Number(m[1]) - 1;
  if (index < 0 || index >= lines.length || hash(lines[index]) !== m[2]) throw staleRef(ref);
  return index;
}

export function singleLine(text: string, field: string): string {
  const value = text.replace(/\s*[\r\n]+\s*/g, " ").trim();
  if (!value) throw new JournalError(`'${field}' must not be empty`);
  return value;
}

/** Non-empty content as lines, trimmed of leading and trailing blank lines. */
export function contentLines(content: string): string[] {
  const text = content.replace(/\r\n/g, "\n").replace(/^\n+|\s+$/g, "");
  if (!text) throw new JournalError("'content' must not be empty");
  return text.split("\n");
}

/** Index after the last non-empty line (keeps the trailing newline out of the way). */
export function contentEnd(lines: Lines, from = 0, to = lines.length): number {
  let end = to;
  while (end > from && lines[end - 1].trim() === "") end--;
  return end;
}
