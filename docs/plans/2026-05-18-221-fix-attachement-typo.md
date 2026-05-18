---
issue: 221
slug: fix-attachement-typo
date: 2026-05-18
status: plan
spec: docs/specs/2026-05-18-221-fix-attachement-typo.md
---

# Plan: Fix `attachement` typo — enum, method, and all consumers

## Approach

Single-commit rename across all affected files. Pure text substitution — no logic changes, no behaviour change. TypeScript compiler enforces completeness: any missed reference fails to compile. One commit keeps `git bisect` attribution clean.

## Steps

1. **Rename enum member** in `src/model/config.ts:4`  
   `attachement` → `attachment`  
   Foundation; compiler immediately flags all unresolved consumers.

2. **Fix enum consumers** in `src/journal/paths.ts`, `src/vscode/dialogues.ts`  
   `JournalPageType.attachement` → `JournalPageType.attachment` at all 5 sites.

3. **Rename method + fix log strings** in `src/features/sync/sync-note-links.ts`  
   Method signature line 21, log strings lines 22/36/41: `injectAttachementLinks` → `injectAttachmentLinks`.

4. **Fix call site** in `src/vscode/startup.ts:101`  
   `injectAttachementLinks` → `injectAttachmentLinks`.

5. **Fix comments** in `src/features/entries/scan-entries.ts:57,92`  
   Inline comment spelling only — no logic change.

6. **Fix plan prose** in `docs/plans/2026-05-18-199-infer-type-context-object.md:20,83`  
   Prevents copy-paste regression in future tasks.

7. **Verify** — `tsc --noEmit` must pass; `grep -rn "attachement" src/` must return zero hits.

8. **Commit + PR** — single commit, PR description links issue, spec, and plan.

## Test Scenarios

| Scenario | Type | Coverage |
|----------|------|----------|
| Compilation succeeds with zero TS errors | compile-time | Proves all enum and method references resolved |
| `grep -rn "attachement" src/` returns zero hits | static analysis | Proves no remaining typo in source |
| Existing unit tests pass unchanged | unit | Proves no behavioural regression (tests in active worktrees will assert `attachment` after rebase) |

No new tests needed — this is a pure rename with no logic change.

## Dependencies

None. Self-contained rename; no other PRs must land first.

## Risk

- **Worktrees diverge temporarily** — worktrees `feat+199`, `feat+209`, `feat+210`, `feat+211` each reference `attachement`. They must rebase on develop after this lands. Low risk: compiler will surface conflicts immediately on rebase.
- **Missed occurrence** — mitigated by grep verification step before commit.

## Rollback

`git revert <commit>` — pure rename reverts cleanly with zero side-effects.

## Reference Spec

[docs/specs/2026-05-18-221-fix-attachement-typo.md](../specs/2026-05-18-221-fix-attachement-typo.md)
