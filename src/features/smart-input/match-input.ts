import { Logger } from '../../shared/logging/logger';
import { isNullOrUndefined } from '../../shared';
import { EntryGranularity, Input } from '../../shared/model/index';
import { resolveTokens } from './date-resolver';
import { tokenize } from './tokenizer';

/**
 * Parses smart input into flag, date (day offset or week) and text: the
 * tokenizer recognizes, the date resolver computes against today.
 */
export class MatchInput {
    private scopeExpression: RegExp = /\s#\w+\s/;

    constructor(
        public logger: Logger,
        public locale: string,
        public granularity: EntryGranularity = "daily",
        private readonly clock: () => Date = () => new Date(),
    ) { }

    /**
     * Takes a string and separates the flag, date and text.
     *
     * @param inputString the value to be parsed
     * @returns the resolved input object
     */
    public async parseInput(inputString: string): Promise<Input> {
        this.logger.trace("Entering parseInput() in features/InputMatcher.ts with input string '", inputString, "'");

        if (isNullOrUndefined(inputString)) {
            throw new Error("cancel");
        }

        try {
            const { tokens, confidence } = tokenize(inputString, this.locale);
            // read per call, so that long-lived instances don't use a stale date (#170)
            const parsedInput = resolveTokens(tokens, this.clock(), this.granularity);
            parsedInput.tags = this.extractTags(inputString);
            parsedInput.confidence = confidence;

            this.logger.trace("Parsed input: ", JSON.stringify(parsedInput));
            return parsedInput;
        } catch (error) {
            this.logger.error("Failed to parse input from string '", inputString, "' due to reason: ", error instanceof Error ? error.message : error);
            throw error;
        }
    }

    /**
     * If tags are present in the input string, extract them if these are configured scopes
     */
    private extractTags(inputString: string): string[] {
        let res: RegExpMatchArray | null = inputString.match(this.scopeExpression);
        return isNullOrUndefined(res) ? [""] : res!;
    }
}
