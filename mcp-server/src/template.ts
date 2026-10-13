/**
 * Template variables as resolved by the vscode-journal extension: the rules are
 * journal-core's (#250); this module adapts them to the server's moment values.
 */
import * as core from "journal-core";
import moment from "moment";

/** The date variables of a template for the given day (in its locale). */
export function resolveDate(template: string, date: moment.Moment): string {
  return core.resolveDate(template, date.toDate(), date.locale());
}

/** `${d+N:format}`: the day N days after the given one (#137). */
export function resolveDayOffsets(template: string, date: moment.Moment): string {
  return core.resolveDayOffsets(template, date.toDate(), date.locale());
}

export { replaceVariable, templatePattern } from "journal-core";

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

