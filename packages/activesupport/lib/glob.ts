import { glob as tinyglob } from "tinyglobby";

export interface GlobOptions {
  cwd?: string;
  dot?: boolean;
}

export async function glob(patterns: string | string[], opts: GlobOptions = {}): Promise<string[]> {
  const results = await tinyglob(patterns, {
    cwd: opts.cwd,
    dot: opts.dot ?? false,
    onlyFiles: false,
  });
  return results.sort();
}
