/** Headings, sections and link targets of a journal entry; insertion at template anchors. */
import { CHECKBOX, type Heading, headings } from "journal-core";

import type { Lines } from "./lines.js";

export { FENCE, type Heading, HEADING, headings, isTask } from "journal-core";
// open "[ ]" (also "[]" from the extension's default template), done "[x]", moved "[>]"
export { CHECKBOX };

export const TASKS = /^(tasks|aufgaben)$/i;
export const TIME = /^zeiterfassung$/i;
const NOTES = /^(notes|notizen)$/i;
/** Start of a block another tool rewrites, e.g. `<!-- claude-session-tracker:begin -->`. */
const GENERATED_BLOCK = /^\s*<!--\s*[\w.-]+:begin\s*-->\s*$/;
/** Link block of weekly entries, maintained by the extension (journal.weeklySync). */
const DAILY_ENTRIES = /^daily entries$/i;

export interface Section {
  heading: Heading;
  /** First line after the section. */
  end: number;
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
 * use "##" too), unless a Tasks, Zeiterfassung or Daily Entries section follows
 * it, or a block another tool generates (`<!-- name:begin -->`): it ends before
 * the "##" section holding that block, or right before the block.
 */
export function notesSection(lines: Lines): Section | undefined {
  const section = findSection(lines, NOTES);
  if (!section) return undefined;
  const after = headings(lines).filter((h) => h.index > section.heading.index && h.level <= 2);
  const next = after.find((h) => TASKS.test(h.text) || TIME.test(h.text) || DAILY_ENTRIES.test(h.text));
  let end = next ? next.index : lines.length;
  const generated = lines.findIndex((l, i) => i > section.heading.index && i < end && GENERATED_BLOCK.test(l));
  if (generated >= 0) {
    // the heading right above the block (only blank lines between) belongs to it
    const holder = after.filter((h) => h.index < generated).at(-1);
    const ownHeading = holder && lines.slice(holder.index + 1, generated).every((l) => l.trim() === "");
    end = ownHeading ? holder.index : generated;
  }
  return { ...section, end };
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

/** Targets of the markdown links in a line, as journal-core reads them (#250). */
export { linkTargets } from "journal-core";

/** Inserts a line as journal-core places lines (#320); returns its index. */
export { placeLine as insertLine } from "journal-core";
