---
issue: 221
slug: fix-attachement-typo
date: 2026-05-18
status: spec
---

# Spec: Rename JournalPageType.attachement → attachment

## Goal

Correct the misspelled enum member `attachement` to `attachment` in `JournalPageType` and all its consumers across the codebase.

## Why Now

Identified during review of #199/#220. The typo is in the core domain model enum, so fixing it now — before more consumers land — minimises blast radius. All current consumers are known and enumerable.

## In Scope

Rename in main-branch source files only (worktrees are ephemeral and will rebase on develop):

| File | Change |
|------|--------|
| `src/model/config.ts:4` | Enum member rename: `attachement` → `attachment` |
| `src/journal/paths.ts:179` | Return value + inline comment |
| `src/features/entries/scan-entries.ts:57,92` | Comments only (`// any attachement`) |
| `src/vscode/dialogues.ts:129,130,460` | Three references to `JournalPageType.attachement` |
| `docs/plans/2026-05-18-199-infer-type-context-object.md:20,83` | Two mentions of the old spelling in plan prose |

Test files on active branches (will be updated by their respective branches on rebase):
- `feat+199-infer-type-context-object`: `src/test/suite/infer-type.test.ts:10,12,15,17`

## Out of Scope

- Other worktrees — they rebase or merge develop after this lands
- Runtime / serialised data (the enum is not persisted to disk or config files by value; used purely in-process)
- No config schema changes required

## Acceptance Criteria

1. `grep -rn "attachement" src/` returns zero hits (excluding worktrees)
2. TypeScript compilation succeeds (`npm run compile` or `tsc --noEmit`)
3. All existing tests pass

## Constraints

- Enum member rename is a pure rename — no behavioural change
- Must stay on a single commit for clean `git bisect` attribution

## Open Questions

None.

## Related

- Identified during: #199, #220
