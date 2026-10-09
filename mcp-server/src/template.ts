/**
 * Template variables as resolved by the vscode-journal extension
 * (src/shared/templates/template-engine.ts), using moment for identical output.
 */
import moment from "moment";

const DATE_VARIABLES: Record<string, (m: moment.Moment) => string> = {
  year: (m) => m.format("YYYY"),
  month: (m) => m.format("MM"),
  day: (m) => m.format("DD"),
  localTime: (m) => m.format("LT"),
  localDate: (m) => m.format("LL"),
  weekday: (m) => m.format("dddd"),
  week: (m) => String(m.week()),
};

const DATE_VARIABLE = /\$\{(?:(year|month|day|localTime|localDate|weekday|week)|(d:[\s\S]+?))\}/g;
const ANY_VARIABLE = /\$\{[^}]+\}/g;

export function resolveDate(template: string, date: moment.Moment): string {
  return template.replace(DATE_VARIABLE, (match, named: string | undefined, custom: string | undefined) => {
    if (named) return DATE_VARIABLES[named](date);
    if (custom) return date.format(custom.slice(2).trim());
    return match;
  });
}

export function replaceVariable(template: string, name: string, value: string): string {
  return template.split(`\${${name}}`).join(value);
}

/** The given ISO day (00:00) in the journal locale. */
export function dayMoment(iso: string, locale: string): moment.Moment {
  return moment(iso, "YYYY-MM-DD", true).locale(locale);
}

/** Current wall-clock time in the journal's timezone, independent of the host timezone. */
export function nowMoment(timezone: string, locale: string): moment.Moment {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return moment(`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`, "YYYY-MM-DD HH:mm").locale(
    locale,
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Regex that recognises lines produced by a template: `${input}` becomes the
 * capture group, every other variable a lazy wildcard.
 */
export function templatePattern(template: string): RegExp {
  const firstLine = template.split("\n")[0];
  let source = "";
  let last = 0;
  for (const m of firstLine.matchAll(ANY_VARIABLE)) {
    source += escapeRegExp(firstLine.slice(last, m.index));
    source += m[0] === "${input}" ? "(.*)" : ".*?";
    last = m.index! + m[0].length;
  }
  source += escapeRegExp(firstLine.slice(last));
  return new RegExp(`^\\s*${source}\\s*$`);
}
