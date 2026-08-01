import * as fs from "fs/promises";
import * as path from "path";
import { generateFromSource, type GenResult } from "./index.js";
import { asyncMethodsForRailsFile } from "./async-source.js";
import { portMethodsForRailsFile } from "./port-symbols.js";
import {
  TARGET_FILES,
  rubyAbsPath,
  rubyAbsPathFor,
  inheritsRelationDelegation,
  RELATION_DELEGATION_SOURCE,
  type TargetFile,
} from "./files.js";
import { delegationsFromSource, type DelegationTable } from "./index.js";
import { buildLinearization, type Linearization } from "./linearization.js";
import { rubyFileToTs } from "./naming.js";

export const SNAPSHOT_DIR = "scripts/prism-codegen/__snapshots__";

export interface GeneratedTarget extends GenResult {
  file: TargetFile;
  outName: string;
}

/** Path of the emitted JS relative to the output root, e.g. `relation/query-methods.js`. */
export function outNameFor(f: TargetFile): string {
  return rubyFileToTs(f.ruby.replace(/^active_record\//, "")).replace(/\.ts$/, ".js");
}

/**
 * Relative specifier the emitted file imports the codegen runtime through. It
 * depends on the output file's depth, so it is part of the generated image and
 * has to be computed identically for `codegen:generate` and for the goldens.
 */
export function runtimeImportPathFor(outName: string): string {
  return "../".repeat(outName.split("/").length) + "runtime.js";
}

/** Repo-relative path of a target's checked-in golden image. */
export function snapshotPathFor(outName: string): string {
  return path.join(SNAPSHOT_DIR, outName + ".snap");
}

/** Same golden image, relative to this directory — the form `toMatchFileSnapshot` wants. */
export function snapshotRelPathFor(outName: string): string {
  return "./" + path.posix.join("__snapshots__", outName + ".snap");
}

let relationDelegations: Promise<DelegationTable> | undefined;

/**
 * The delegation table a target inherits. Rails compiles `relation/delegation.rb`'s
 * `delegate ... to: :model` / `to: :records` macros into every Relation subclass,
 * so the whole Relation family resolves those names through their receiver. The
 * source is parsed once per process and shared by every caller.
 */
export async function inheritedDelegationsFor(f: TargetFile): Promise<DelegationTable | undefined> {
  if (!inheritsRelationDelegation(f.ruby)) return undefined;
  relationDelegations ??= fs
    .readFile(rubyAbsPathFor(RELATION_DELEGATION_SOURCE), "utf8")
    .then(delegationsFromSource);
  return relationDelegations;
}

let linearizationPromise: Promise<Linearization> | undefined;

/**
 * The `super` linearization over the whole target set. It is part of the
 * generated image, so it is memoized rather than rebuilt per target — every
 * target must see the same ancestry and def index.
 */
export function targetLinearization(): Promise<Linearization> {
  linearizationPromise ??= (async () => {
    const sources = await Promise.all(TARGET_FILES.map((t) => fs.readFile(rubyAbsPath(t), "utf8")));
    const base = TARGET_FILES.findIndex((t) => t.ruby === "active_record/base.rb");
    return buildLinearization(base < 0 ? "" : sources[base], sources);
  })();
  return linearizationPromise;
}

/** Generate one target file's JS exactly as `pnpm codegen:generate` writes it. */
export async function generateTarget(f: TargetFile): Promise<GeneratedTarget> {
  const outName = outNameFor(f);
  const src = await fs.readFile(rubyAbsPath(f), "utf8");
  const result = await generateFromSource(
    src,
    asyncMethodsForRailsFile(f.ruby),
    runtimeImportPathFor(outName),
    await inheritedDelegationsFor(f),
    await targetLinearization(),
    portMethodsForRailsFile(f.ruby),
  );
  return { ...result, file: f, outName };
}

/**
 * Whether the vendored Rails checkout the generator reads is present. The golden
 * suite skips itself when it is not: `unit-tests` runs the rest of this
 * directory without `vendor/`, and only `rails-comparison` fetches it.
 */
export async function vendoredRailsPresent(): Promise<boolean> {
  try {
    await fs.access(rubyAbsPath(TARGET_FILES[0]));
    return true;
  } catch {
    return false;
  }
}
