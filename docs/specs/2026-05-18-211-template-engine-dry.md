# Spec: Consolidate Template and Date Replacement Logic (DRY) — #211

## Goal
Extract duplicated `${variable}` template resolution into a single `TemplateEngine` service so that adding or changing a template variable requires editing exactly one place.

## Why now
feat-210 (rich domain models) is in progress. Once its types land on `develop`, a `TemplateEngine` becomes a natural next refactoring step — the timing avoids double-churn on `src/model/`.

## In scope
- Extract `replaceDateFormats` and `replaceDateTemplatesWithMomentsFormats` from `src/util/dates.ts` into a new `TemplateEngine` module.
- Replace the two parallel switch/case blocks with a single central variable map (`TEMPLATE_VARIABLE_MAP`) that holds both the moment format string and resolution logic per variable.
- Expose two public functions from the engine:
  - `resolveDate(template, date, locale?)` — replaces `${var}` with actual formatted values (replaces `replaceDateFormats`)
  - `toMomentFormat(template)` — replaces `${var}` with moment format tokens (replaces `replaceDateTemplatesWithMomentsFormats`)
- Delete the duplicate implementation in `src/test/direct/path-parse-with-date.ts:124`.
- Update all callers: `src/journal/paths.ts`, `src/vscode/conf.ts`, `src/features/sync/sync-daily-links.ts`.
- Keep `replaceVariableValue` in `src/util/strings.ts` (generic key/value; not template-engine-specific).
- Update barrel exports in `src/util/index.ts`.

## Out of scope
- Changing the set of supported template variables (no new variables in this PR).
- Replacing `replaceVariableValue` with the engine.
- Any changes to `src/vscode/conf.ts` beyond updating the import path.
- feat-210 rich domain model changes.

## Acceptance criteria
1. `replaceDateFormats` and `replaceDateTemplatesWithMomentsFormats` no longer exist in `src/util/dates.ts`.
2. Adding a new template variable requires editing only `TEMPLATE_VARIABLE_MAP` (one location).
3. All existing tests pass without modification to test assertions.
4. The duplicate in `src/test/direct/path-parse-with-date.ts` is removed; that file imports from the engine instead.
5. `npm run compile` (or equivalent) succeeds.
6. No behavior change — output of `resolveDate` matches the old `replaceDateFormats` output for all supported variables.

## Entities / contracts

### TEMPLATE_VARIABLE_MAP
```typescript
// Central map — the single source of truth
interface TemplateVariableEntry {
    momentFormat: string;  // used by toMomentFormat
}
const TEMPLATE_VARIABLE_MAP: Record<string, TemplateVariableEntry> = {
    year:      { momentFormat: 'YYYY' },
    month:     { momentFormat: 'MM' },
    day:       { momentFormat: 'DD' },
    localTime: { momentFormat: 'LT' },
    localDate: { momentFormat: 'LL' },
    weekday:   { momentFormat: 'dddd' },
    week:      { momentFormat: 'w' },    // only in resolveDate currently; add to toMomentFormat for symmetry
};
```

### Public API (new module)
```typescript
export function resolveDate(template: string, date: Date, locale?: string): string
export function toMomentFormat(template: string): string
// regex stays module-private
const TEMPLATE_VAR_REGEX = /\$\{(?:(year|month|day|localTime|localDate|weekday|week)|(d:[\s\S]+?))\}/g;
```

### Module location — OPEN QUESTION
Issue suggests `src/core/templates/engine.ts` (new `core` layer). No `src/core/` directory exists today. Alternative: `src/util/template-engine.ts` (fits existing structure; minimal disruption). **Preferred: `src/util/template-engine.ts`** unless the author wants to introduce the `core` layer for future domain-pure modules.

## Constraints
- Moment.js is the only date library in use; stay with it.
- No new runtime dependencies.
- Must not break `src/test/direct/replace-variables-in-string.ts` (imports `replaceDateFormats` from `../../util/dates` — update import).

## Open questions
1. `src/core/templates/engine.ts` vs `src/util/template-engine.ts`? The `core` layer would be a new architectural boundary. Is that intentional for #211 or a future concern?
2. `week` variable is present in `replaceDateFormats` but absent from `replaceDateTemplatesWithMomentsFormats`. Intentional gap or bug? Should `toMomentFormat` also map `${week}` → `'w'`?

## Related issues
- Blocks: none
- Related: #210 (rich domain models — avoid double-churn; implement after feat-210 lands)
- Related: #209 (domain module naming — completed; barrel keys already aligned)
