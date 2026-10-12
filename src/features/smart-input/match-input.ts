import { EntryGranularity, Input } from '../../shared/model/index';
import { resolveTokens } from './date-resolver';
import { tokenize } from './tokenizer';

/**
 * Parses smart input into flag, date (day offset or week) and text: the
 * tokenizer recognizes, the date resolver computes against `today`. Tags and
 * scope are extracted by {@link Input.extractScopeAndTags}.
 *
 * @throws if a task or memo has no text, or a date is out of range ("13-01")
 */
export function matchInput(value: string, locale: string, granularity: EntryGranularity = 'daily', today: Date = new Date()): Input {
    const { tokens, confidence } = tokenize(value, locale);
    const input = resolveTokens(tokens, today, granularity);
    input.confidence = confidence;
    return input;
}
