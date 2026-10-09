/**
 * What may leave the server. Content tagged as private (e.g. "## Topic #private",
 * a tag line right below a heading, a single line containing the tag, or a link
 * into a private scope) is never returned and cannot be addressed by refs.
 *
 * Every function that returns content or resolves refs takes a VisibleLines:
 * it can only be created together with a Policy, so no read path can skip the mask.
 * The module exports no default policy and no raw mask/ref functions, so the
 * server's policy (built once from the configuration) is the only one in use.
 */
import { type Lines, resolveRef, staleRef } from "./lines.js";
import { headings, linkTargets, notesSection } from "./structure.js";

export interface Policy {
  /** Tags (without "#") marking content that is never returned. */
  privateTags: string[];
  /** Whether the notes area (content and headings) may be returned. */
  notesReadable: boolean;
  /** Path fragments (e.g. "scopes/private/"); lines linking to such targets are private. */
  privateLinks?: string[];
}

const TAGS_ONLY = /^\s*(#[\p{L}\p{N}_-]+\s*)+$/u;

function tagPattern(tags: string[]): RegExp | null {
  const names = tags.map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
  if (!names.length) return null;
  const alternatives = names.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`(^|\\s)#(${alternatives})(?![\\p{L}\\p{N}_-])`, "iu");
}

/** Lines that must never leave the server because they are tagged private. */
export function privateMask(lines: Lines, policy: Policy): boolean[] {
  const mask = lines.map(() => false);
  const tag = tagPattern(policy.privateTags);
  if (!tag) return mask;
  const hs = headings(lines);
  hs.forEach((h, k) => {
    const nextAny = k + 1 < hs.length ? hs[k + 1].index : lines.length;
    const firstLine = lines.slice(h.index + 1, nextAny).find((l) => l.trim() !== "");
    const tagged = tag.test(h.text) || (firstLine !== undefined && TAGS_ONLY.test(firstLine) && tag.test(firstLine));
    if (!tagged) return;
    const next = hs.slice(k + 1).find((n) => n.level <= h.level);
    for (let i = h.index; i < (next ? next.index : lines.length); i++) mask[i] = true;
  });
  const links = (policy.privateLinks ?? []).map((l) => l.toLowerCase());
  lines.forEach((line, i) => {
    if (tag.test(line)) mask[i] = true;
    if (links.length && linkTargets(line).some((t) => links.some((l) => `/${t.toLowerCase()}`.includes(`/${l}`)))) {
      mask[i] = true;
    }
  });
  return mask;
}

/**
 * Lines of a journal file together with the policy that decides what is
 * visible. Only the type leaves the journal module; instances are created
 * with visible().
 */
export class VisibleLines {
  constructor(
    /** The underlying lines; edits go here. */
    readonly lines: Lines,
    readonly policy: Policy,
  ) {}

  get notesReadable(): boolean {
    return this.policy.notesReadable;
  }

  /** Private lines (tags, links into private scopes); computed on the current lines. */
  privateMask(): boolean[] {
    return privateMask(this.lines, this.policy);
  }

  /** Lines that must not be returned: private lines, plus the notes area if notes are not readable. */
  hiddenMask(): boolean[] {
    const mask = this.privateMask();
    const notes = this.policy.notesReadable ? undefined : notesSection(this.lines);
    if (notes) for (let i = notes.heading.index; i < notes.end; i++) mask[i] = true;
    return mask;
  }

  /** Like resolveRef, but hidden lines are indistinguishable from stale refs. */
  resolveRef(ref: string, mask: boolean[] = this.hiddenMask()): number {
    const index = resolveRef(this.lines, ref);
    if (mask[index]) throw staleRef(ref);
    return index;
  }
}

/** The only way to read content: lines plus the policy that masks them. */
export function visible(lines: Lines, policy: Policy): VisibleLines {
  return new VisibleLines(lines, policy);
}
