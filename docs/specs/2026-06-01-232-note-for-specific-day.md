# Spec: Note creation linked to specific day (#232)

## Goal

Allow users to prefix a temporal expression (weekday, offset, shortcut) before a note title in the `journal.note` input so the note is both stored under and linked from the target day's journal entry instead of today's.

## Why now

The #177 tokenizer (PR #231) already parses temporal prefixes from note input — `"mon SecurityCodeReview"` → `offset = next Monday, text = "SecurityCodeReview"`. Two call sites still ignore `input.offset` and hardcode today: `LoadNotes.loadWithPath` (where to inject the link) and `Parser.resolveNotePathForInput` (where to store the file). Both are one-line fixes.

## In scope

- Use `input.generateDate()` (which respects `offset` and `date`) instead of `new Date()` / `new Input(0)` in both call sites.
- Supported temporal expressions: anything `parseInput` already resolves — weekday aliases (`mon`, `monday`, `di`…), relative offsets (`+1`, `-1`), shortcuts (`today`, `tomorrow`, `yesterday`).
- Default (no temporal prefix): `offset = 0` → `generateDate()` = today → behaviour unchanged.

## Out of scope

- Week-number targets (`w23 SecurityCodeReview`) — notes path patterns don't use week numbers; linking a note to a weekly entry is a separate concern.
- ISO date targets (`2026-06-15 SecurityCodeReview`) — uncommon in note titles; deferred.
- Changes to note filename format or path pattern config keys.
- Changes to `ShowNoteCommand.execute` — it already calls `parseInput` and passes the result to `LoadNotes`; no change needed there.

## Acceptance criteria

1. `parseInput("mon SecurityCodeReview")` → `offset = next Monday's offset`, `text = "SecurityCodeReview"`. (Already true from #177 — regression test in PR #231.)
2. Typing `mon SecurityCodeReview` in `journal.note` input creates `SecurityCodeReview.md` stored under Monday's date directory (per `journal.patterns.notes.path`) and injects the link into Monday's journal entry, not today's.
3. Typing `SecurityCodeReview` (no prefix) → link injected into today's entry, note stored today. No regression.
4. Typing `+2 PrepareDemo` → link in day-after-tomorrow's entry. Offset generalises to all `parseInput`-supported expressions.
5. Full test suite green.

## Entities / contracts

### `src/features/entries/load-note.ts` — `LoadNotes.loadWithPath`

Current:
```ts
await this.ctrl.reader.loadEntryForInput(new J.Model.Input(0))
```

Fix — replace with an `Input` that carries the same offset/date as `this.input`:
```ts
const entryInput = new J.Model.Input(this.input.offset);
entryInput.date = this.input.date;
entryInput.scope = this.input.scope;
await this.ctrl.reader.loadEntryForInput(entryInput)
```

`Input.generateDate()` already resolves `date` (if set) first, then falls back to `new Date() + offset`. No new logic needed.

### `src/journal/parser.ts` — `Parser.resolveNotePathForInput`

Current (line 48):
```ts
const date = new Date();
```

Fix:
```ts
const date = input.generateDate();
```

No other changes in this function. `getNotesFilePattern` and `getResolvedNotesPath` already accept a `Date` parameter.

## Constraints

- `ShowNoteCommand` casts `parsedInput as J.Model.NoteInput`. `NoteInput` extends `Input`; the cast is safe because only `_path` is added by `NoteInput`, which remains `""` but is never used in the note-creation flow (path is resolved freshly by `resolveNotePathForInput`).
- `input.offset = 0` is the default → `generateDate()` = today → existing behaviour unchanged.
- No changes to `Input`, `NoteInput`, or `IConfiguration` interfaces.

## Open questions

None.

## Related issues

- Blocked by: #177 / PR #231 (tokenizer must land first — `parseInput` must return correct offset from temporal prefix)
- Follow-on from: #149 (original feature request)
