import * as fs from "fs/promises";
import * as path from "path";
import { generateFromSource, type GenResult } from "./index.js";
import { asyncMethodsForRailsFile } from "./async-source.js";
import { TARGET_FILES, rubyAbsPath, type TargetFile } from "./files.js";
import { rubyFileToTs } from "./naming.js";

export const SNAPSHOT_DIR = "scripts/prism-codegen/__snapshots__";

export interface GeneratedTarget extends GenResult {
  file: TargetFile;
  outName: string;
}

export function outNameFor(f: TargetFile): string {
  return rubyFileToTs(f.ruby.replace(/^active_record\//, "")).replace(/\.ts$/, ".js");
}

// The emitted file imports the codegen runtime by relative path, so the depth of
// the output file decides the prefix — a golden snapshot that regenerated at a
// different depth would diff on the import line alone.
export function runtimeImportPathFor(outName: string): string {
  const depth = outName.split("/").length - 1;
  return "../".repeat(depth + 1) + "runtime.js";
}

export function snapshotPathFor(outName: string): string {
  return path.join(SNAPSHOT_DIR, outName + ".snap");
}

export async function generateTarget(f: TargetFile): Promise<GeneratedTarget> {
  const outName = outNameFor(f);
  const src = await fs.readFile(rubyAbsPath(f), "utf8");
  const result = await generateFromSource(
    src,
    asyncMethodsForRailsFile(f.ruby),
    runtimeImportPathFor(outName),
  );
  return { ...result, file: f, outName };
}

export async function generateAllTargets(): Promise<GeneratedTarget[]> {
  const out: GeneratedTarget[] = [];
  for (const f of TARGET_FILES) out.push(await generateTarget(f));
  return out;
}

// The golden suite regenerates from the vendored Rails checkout, which the
// unit-tests CI job does not fetch. Callers use this to skip there rather than
// fail on ENOENT; the rails-comparison job fetches vendor/ and runs it for real.
export async function vendoredRailsPresent(): Promise<boolean> {
  try {
    await fs.access(rubyAbsPath(TARGET_FILES[0]));
    return true;
  } catch {
    return false;
  }
}
