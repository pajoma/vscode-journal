/** Links from entries to notes, written with the extension's `files` template. */
import { parseWikiTarget, wikiLinks, type WikiNote, wikiTargetMatchesNote } from "journal-core";
import { type Lines, lineRef, singleLine } from "./lines.js";
import { insertLine, isTask, linkTargets } from "./structure.js";

/**
 * Inserts a link line (rendered `files` template) at the template's anchor,
 * unless the entry already links to `target`, or to `note` with a wiki link
 * such as `[[Konzept]]` (#92). Returns the ref, or undefined if the link
 * already existed.
 */
export function addLink(lines: Lines, linkLine: string, after: string, target: string, note?: WikiNote): string | undefined {
  if (lines.some((l) => linkTargets(l).includes(target))) return undefined;
  if (note && lines.some((l) => wikiLinks(l).some((link) => wikiTargetMatchesNote(parseWikiTarget(link.target), note)))) return undefined;
  const isLink = (l: string) => linkTargets(l).length > 0 && /^\s*[-*+]\s/.test(l) && !isTask(l);
  return lineRef(lines, insertLine(lines, singleLine(linkLine, "link"), after, isLink));
}
