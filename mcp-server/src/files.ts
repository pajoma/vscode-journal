/** Files of the journal on disk. */
import { readdir } from "node:fs/promises";
import path from "node:path";

/** The files with the extension below a folder, relative to it, sorted; hidden (`.`) and temporary (`~`) files and folders skipped. */
export async function listFiles(dir: string, ext: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const result: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name.startsWith("~")) continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) result.push(...(await listFiles(path.join(dir, e.name), ext, rel)));
    else if (e.name.endsWith(ext)) result.push(rel);
  }
  return result.sort((a, b) => a.localeCompare(b));
}
