/** The "## Zeiterfassung" table: | Von | Bis | Zeit | Kunde/Projekt | Tätigkeit |. */
import { formatTime, parseTime } from "../dates.js";
import { contentEnd, JournalError, type Lines, lineRef, singleLine } from "./lines.js";
import type { VisibleLines } from "./privacy.js";
import { findSection, notesSection, TIME } from "./structure.js";

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;

export const TIME_HEADER = "| Von   | Bis   | Zeit  | Kunde/Projekt | Tätigkeit |";
export const TIME_SEPARATOR = "|-------|-------|-------|--------------|-----------|";

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

export function listTimeEntries(view: VisibleLines): TimeEntry[] {
  const hidden = view.privateMask();
  return timeRows(view.lines)
    .filter((i) => !hidden[i])
    .map((i) => parseRow(view.lines, i));
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

/** Visible rows overlapping the interval; private rows are never mentioned. */
function overlaps(view: VisibleLines, startMin: number, endMin: number, skip?: number): string[] {
  const hidden = view.privateMask();
  return timeRows(view.lines)
    .filter((i) => i !== skip && !hidden[i])
    .map((i) => parseRow(view.lines, i))
    .filter((e) => {
      try {
        return parseTime(e.start) < endMin && startMin < parseTime(e.end);
      } catch {
        return false;
      }
    })
    .map((e) => `Overlaps ${e.start}-${e.end} ${e.project} (${e.description})`);
}

export function addTimeEntry(view: VisibleLines, input: TimeInput): { ref: string; warnings: string[] } {
  const { lines } = view;
  const { row, startMin, endMin } = buildRow(input);
  const warnings = overlaps(view, startMin, endMin);
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
  view: VisibleLines,
  ref: string,
  change: Partial<TimeInput>,
): { ref: string; warnings: string[] } {
  const { lines } = view;
  const i = view.resolveRef(ref, view.privateMask());
  if (!timeRows(lines).includes(i)) throw new JournalError(`Ref '${ref}' does not point to a time entry`);
  const current = parseRow(lines, i);
  const { row, startMin, endMin } = buildRow({
    start: change.start ?? current.start,
    end: change.end ?? current.end,
    project: change.project ?? current.project,
    description: change.description ?? current.description,
  });
  lines[i] = row;
  return { ref: lineRef(lines, i), warnings: overlaps(view, startMin, endMin, i) };
}
