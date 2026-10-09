/** Checklist tasks: open "[ ]", done "[x] … (done: …)", moved "[>] … (moved: …)" as the extension writes them. */
import { templatePattern } from "../template.js";
import { JournalError, type Lines, lineRef, singleLine } from "./lines.js";
import type { VisibleLines } from "./privacy.js";
import { FENCE, headingContext, insertLine } from "./structure.js";

// open "[ ]" (also "[]" from the extension's default template), done "[x]", moved "[>]"
const CHECKBOX = /^(\s*)([-*+])\s?\[\s{0,2}(x|X|>)?\s{0,2}\]\s?(.*)$/;
const DONE_SUFFIX = /\s*\(done: [^)]*\)\s*$/;
const MOVED_SUFFIX = /\s*\(moved: [^)]*\)\s*$/;

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

export function isTask(line: string): boolean {
  const m = CHECKBOX.exec(line);
  return !!m && m[4].trim() !== "";
}

export function listTasks(view: VisibleLines): Task[] {
  const { lines } = view;
  const hidden = view.hiddenMask();
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
  view: VisibleLines,
  ref: string,
  change: { done?: boolean; text?: string },
  now: string,
): string {
  const { lines } = view;
  const i = view.resolveRef(ref);
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
export function markTaskMoved(view: VisibleLines, ref: string, target: string, taskTemplate: string): string {
  const { lines } = view;
  const i = view.resolveRef(ref);
  const m = CHECKBOX.exec(lines[i]);
  if (!m) throw new JournalError(`Ref '${ref}' does not point to a task`);
  if (taskStatus(m[3]) !== "open") throw new JournalError(`Task '${ref}' is not open`);
  const text = taskText(lines[i], taskTemplate);
  lines[i] = `${m[1]}${m[2]} [>] ${m[4].trim()} (moved: ${target})`;
  return text;
}
