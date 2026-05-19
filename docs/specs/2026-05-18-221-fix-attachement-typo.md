---
issue: 221
slug: fix-attachement-typo
date: 2026-05-18
status: spec
---

# Spec: Fix `attachement` typo — enum, method, and all consumers

## Goal

Eliminate every occurrence of the misspelled token `attachement` across enum member, method name, log strings, comments, and documentation prose.

## Why Now

Identified during review of #199/#220. The typo spans the core domain model enum AND a public method (`injectAttachementLinks`). Fixing now — before more consumers land — minimises blast radius. All current sites are known and enumerable.

## In Scope

Rename in main-branch source files only (worktrees are ephemeral and will rebase on develop):

| File | Lines | Change |
|------|-------|--------|
| `src/model/config.ts` | 4 | Enum member: `attachement` → `attachment` |
| `src/journal/paths.ts` | 179 | Return value + inline comment |
| `src/features/entries/scan-entries.ts` | 57, 92 | Comments only |
| `src/vscode/dialogues.ts` | 129, 130, 460 | Three enum references |
| `src/features/sync/sync-note-links.ts` | 21, 22, 36, 41 | Method rename + log strings: `injectAttachementLinks` → `injectAttachmentLinks` |
| `src/vscode/startup.ts` | 101 | Call site: `injectAttachementLinks` → `injectAttachmentLinks` |
| `docs/plans/2026-05-18-199-infer-type-context-object.md` | 20, 83 | Plan prose mentions |

Test files on active branches (updated by their branch on rebase):
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
