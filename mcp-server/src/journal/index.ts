/**
 * Pure, line-based parsing and editing of journal files (daily and weekly
 * entries, scoped note files).
 *
 * Format (as written by vscode-journal and the time-tracker conventions):
 *
 *   # Wednesday, October 07 2026
 *   ## Tasks
 *   - [ ] open task
 *   - [x] done task
 *   ## Zeiterfassung
 *   | Von   | Bis   | Zeit  | Kunde/Projekt | Tätigkeit |
 *   |-------|-------|-------|---------------|-----------|
 *   | 09:00 | 11:30 | 2.5h  | Project       | Activity  |
 *   ## Notes
 *   ...everything below "## Notes" belongs to the notes area,
 *   including further "##" headings.
 *
 * Entries are addressed by temporary refs ("L<line>-<hash>") that are only
 * valid as long as the referenced line is unchanged.
 *
 * Functions that return content or resolve refs take a VisibleLines (privacy.ts),
 * so the privacy mask cannot be skipped; pure insertions take plain Lines.
 */
export { fromLines, JournalError, type Lines, newEntry, StaleRefError, toLines } from "./lines.js";
export { type Policy, visible, type VisibleLines } from "./privacy.js";
export { addTask, listTasks, markTaskMoved, type Task, type TaskStatus, taskText, updateTask } from "./tasks.js";
export { addMemo, listMemos, type Memo } from "./memos.js";
export {
  addTimeEntry,
  listTimeEntries,
  TIME_HEADER,
  TIME_SEPARATOR,
  type TimeEntry,
  type TimeInput,
  updateTimeEntry,
} from "./time.js";
export {
  addNote,
  appendNote,
  appendToDocument,
  type NoteContent,
  type NoteHeading,
  readDocument,
  readNotes,
} from "./notes.js";
export { addLink } from "./links.js";
