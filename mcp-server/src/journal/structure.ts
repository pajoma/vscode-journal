/** Headings, sections and link targets of a journal entry; insertion at template anchors. */
import type { Lines } from "./lines.js";

export const HEADING = /^(#{1,6})\s+(.*?)\s*$/;
export const FENCE = /^\s*(```|~~~)/;

export const TASKS = /^(tasks|aufgaben)$/i;
export const TIME = /^zeiterfassung$/i;
const NOTES = /^(notes|notizen)$/i;
/** Link block of weekly entries, maintained by the extension (journal.weeklySync). */
const DAILY_ENTRIES = /^daily entries$/i;

const LINK_TARGET = /\]\(<?([^)>]*)>?\)/g;

export interface Heading {
  index: number;
  level: number;
  text: string;
}

export interface Section {
  heading: Heading;
  /** First line after the section. */
  end: number;
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

export function findSection(lines: Lines, name: RegExp): Section | undefined {
  const hs = headings(lines);
  const i = hs.findIndex((h) => h.level === 2 && name.test(h.text));
  if (i < 0) return undefined;
  const next = hs.slice(i + 1).find((h) => h.level <= 2);
  return { heading: hs[i], end: next ? next.index : lines.length };
}

/**
 * The notes area runs from "## Notes" to the end of the file (sub-topics often
 * use "##" too), unless a Tasks, Zeiterfassung or Daily Entries section follows it.
 */
export function notesSection(lines: Lines): Section | undefined {
  const section = findSection(lines, NOTES);
  if (!section) return undefined;
  const next = headings(lines).find(
    (h) =>
      h.index > section.heading.index &&
      h.level <= 2 &&
      (TASKS.test(h.text) || TIME.test(h.text) || DAILY_ENTRIES.test(h.text)),
  );
  return { ...section, end: next ? next.index : lines.length };
}

/** Nearest heading above each line (null before the first heading). */
export function headingContext(lines: Lines): (Heading | null)[] {
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

/** Targets of the markdown links in a line, decoded and with "\" as "/". */
export function linkTargets(line: string): string[] {
  return [...line.matchAll(LINK_TARGET)].map((m) => {
    let target = m[1].trim().replace(/\\/g, "/");
    try {
      target = decodeURI(target);
    } catch {
      // keep as is
    }
    return target;
  });
}

/**
 * Inserts a line the way the extension's templates place content: below the
 * template's `after` anchor, or directly below the title if it has none.
 * Lines of the same kind are kept together (new ones go after existing ones).
 */
export function insertLine(lines: Lines, line: string, after: string, sameKind: (l: string) => boolean): number {
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
