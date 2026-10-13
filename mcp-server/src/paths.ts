import path from "node:path";

/** Whether `child` is `parent` or lies below it: the repository boundary no file access may cross. */
export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
