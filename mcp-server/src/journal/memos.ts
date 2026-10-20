/** One-line memos, recognised and written with the user's `memo` template. */
import { LINE_KINDS } from "journal-core";
import { templatePattern } from "../template.js";
import { type Lines, lineRef, singleLine } from "./lines.js";
import type { VisibleLines } from "./privacy.js";
import { insertLine, isTask } from "./structure.js";

export interface Memo {
  ref: string;
  text: string;
}

export function listMemos(view: VisibleLines, memoTemplate: string): Memo[] {
  const { lines } = view;
  const pattern = templatePattern(memoTemplate);
  const hidden = view.hiddenMask();
  const memos: Memo[] = [];
  lines.forEach((line, i) => {
    const m = hidden[i] || isTask(line) ? null : pattern.exec(line);
    if (m) memos.push({ ref: lineRef(lines, i), text: (m[1] ?? line).trim() });
  });
  return memos;
}

/** Inserts a memo line rendered from the `memo` template. */
export function addMemo(lines: Lines, memoLine: string, after: string, memoTemplate: string): string {
  return lineRef(lines, insertLine(lines, singleLine(memoLine, "memo"), after, LINE_KINDS.memo(memoTemplate)));
}
