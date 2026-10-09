/** Links from entries to notes, written with the extension's `files` template. */
import { type Lines, lineRef, singleLine } from "./lines.js";
import { insertLine, linkTargets } from "./structure.js";
import { isTask } from "./tasks.js";

/**
 * Inserts a link line (rendered `files` template) at the template's anchor,
 * unless the entry already links to `target`. Returns the ref, or undefined if
 * the link already existed.
 */
export function addLink(lines: Lines, linkLine: string, after: string, target: string): string | undefined {
  if (lines.some((l) => linkTargets(l).includes(target))) return undefined;
  const isLink = (l: string) => linkTargets(l).length > 0 && /^\s*[-*+]\s/.test(l) && !isTask(l);
  return lineRef(lines, insertLine(lines, singleLine(linkLine, "link"), after, isLink));
}
