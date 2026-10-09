/** One-line memos, recognised and written with the user's `memo` template. */
import { templatePattern } from "../template.js";
import { type Lines, lineRef, singleLine } from "./lines.js";
import type { VisibleLines } from "./privacy.js";
import { insertLine } from "./structure.js";
import { isTask } from "./tasks.js";

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
  const pattern = templatePattern(memoTemplate);
  const line = singleLine(memoLine, "memo");
  return lineRef(
    lines,
    insertLine(lines, line, after, (l) => pattern.test(l) && !isTask(l)),
  );
}
