#!/usr/bin/env npx tsx
/**
 * CI gate for `@inlinedFrom` staleness, both ways (RFC 0188).
 *
 * A tag is red when it names a `def` the Rails manifest does not hold, cites
 * that `def` at another path or line span, names a module the Rails
 * counterpart of its class neither includes, prepends nor extends, or names a
 * `def` in the Ruby file the constructor's own file mirrors. `--fix` rewrites
 * a stale citation from the manifest, which is the only place one comes from.
 *
 * The reverse arm, a Rails class that reaches a module `initialize` or a
 * `ClassMethods#new` in ANOTHER Ruby file and whose constructor carries no tag
 * for it, gates the packages in {@link MISSING_TAG_PACKAGES} only.
 *
 * Usage:
 *   pnpm parity:api:inlined          # gate (CI)
 *   pnpm parity:api:inlined:fix      # rewrite stale citations
 *
 * Run `pnpm parity:api` first so output/rails-api.json and ts-api.json are fresh.
 *
 * Hard rules: no node:* imports, async fs only, no third-party runtime deps.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import type { ApiManifest, ClassInfo, InlinedFrom } from "@blazetrails/parity/types";
import { rubyFileToTs } from "@blazetrails/parity/conventions";
import { resolveModuleName } from "./compare.js";
import { OUTPUT_DIR, ROOT_DIR, packageSrcDir } from "./config.js";
import { moduleAncestors } from "./inlined-bodies.js";
import { TAG } from "./inlined-from-tags.js";

/**
 * The packages whose missing-tag arm gates. Only-grow: a package joins in the
 * PR that converts its constructors, and none leaves to turn a red run green.
 */
export const MISSING_TAG_PACKAGES: readonly string[] = [];

export interface InlinedFromFinding {
  package: string;
  tsFile: string;
  owner: string;
  /** The `Module#hook` the finding is about. */
  hook: string;
  message: string;
  /** A stale citation and the manifest's, for `--fix`. */
  fix?: { cited: string; actual: string };
}

interface Entity {
  package: string;
  fqn: string;
  info: ClassInfo;
}

const entities = (ruby: ApiManifest, kind: "classes" | "modules"): Entity[] =>
  Object.entries(ruby.packages).flatMap(([name, pkg]) =>
    (Object.entries(pkg[kind]) as unknown as [string, ClassInfo][]).map(([fqn, info]) => ({
      package: name,
      fqn,
      info,
    })),
  );

const defines = (entity: Entity | undefined, hook: InlinedFrom["hook"]) =>
  entity?.info.instanceMethods.find((m) => m.name === hook);

/**
 * The hooks an entity's constructor answers to from other Ruby files, in
 * ancestor order, and the modules whose hook shares the entity's own file.
 */
function reachedHooks(entity: Entity, modules: ReadonlyMap<string, Entity>) {
  const byShort = new Map<string, string[]>();
  for (const fqn of modules.keys()) {
    const short = fqn.split("::").pop()!;
    byShort.set(short, [...(byShort.get(short) ?? []), fqn]);
  }
  const resolve = (name: string, context: string) => resolveModuleName(name, context, byShort);
  const infos = Object.fromEntries([...modules].map(([fqn, mod]) => [fqn, mod.info]));
  const ancestors = moduleAncestors(entity.info, entity.fqn, infos, resolve);
  const mixed = [...ancestors.prepended, ...ancestors.included];
  const extended = [
    ...(entity.info.extends ?? []).map((name) => resolve(name, entity.fqn)),
    ...mixed.map((fqn) => `${fqn}::ClassMethods`),
  ];
  const reached = { tagged: [] as string[], sameFile: [] as string[] };
  const sort = (fqns: readonly string[], hook: InlinedFrom["hook"]) => {
    for (const fqn of fqns) {
      const mod = modules.get(fqn);
      if (hook === "new" && !fqn.endsWith("::ClassMethods")) continue;
      if (defines(mod, hook) === undefined) continue;
      const sameFile = mod!.package === entity.package && mod!.info.file === entity.info.file;
      (sameFile ? reached.sameFile : reached.tagged).push(`${fqn}#${hook}`);
    }
  };
  sort(extended, "new");
  sort(mixed, "initialize");
  return reached;
}

/** Every finding over the two manifests; `enrolled` gates the missing-tag arm. */
export function inlinedFromFindings(
  ruby: ApiManifest,
  ts: ApiManifest,
  enrolled: readonly string[] = MISSING_TAG_PACKAGES,
): InlinedFromFinding[] {
  const modules = new Map(entities(ruby, "modules").map((mod) => [mod.fqn, mod]));
  const rubyEntities = [...entities(ruby, "classes"), ...modules.values()];
  const findings: InlinedFromFinding[] = [];
  for (const [name, pkg] of Object.entries(ts.packages)) {
    for (const [owner, klass] of Object.entries(pkg.classes) as unknown as [string, ClassInfo][]) {
      const ctor = klass.instanceMethods.find((m) => m.name === "constructor");
      const tags = ctor?.inlinedFrom ?? [];
      if (tags.length === 0 && !enrolled.includes(name)) continue;
      const tsFile = ctor?.file ?? klass.file;
      if (tsFile === undefined) continue;
      const short = owner.split(".").pop()!;
      const counterpart = rubyEntities.find(
        (entity) =>
          entity.package === name &&
          entity.fqn.split("::").pop() === short &&
          entity.info.file !== undefined &&
          rubyFileToTs(entity.info.file, name) === tsFile,
      );
      const reached = counterpart && reachedHooks(counterpart, modules);
      const report = (hook: string, message: string, fix?: InlinedFromFinding["fix"]) =>
        findings.push({ package: name, tsFile, owner, hook, message, ...(fix ? { fix } : {}) });
      for (const tag of tags) {
        const hook = `${tag.module}#${tag.hook}`;
        const body = defines(modules.get(tag.module), tag.hook);
        if (body === undefined) {
          report(hook, "names no Ruby body: the manifest has no such `def`");
          continue;
        }
        const cited = `${tag.source}/${tag.version}/${tag.file}:${tag.firstLine}-${tag.lastLine}`;
        const actual = `${body.vendorFile}:${body.line}-${body.endLine}`;
        if (body.vendorFile === undefined) {
          report(hook, "cannot be checked: its Ruby file was read from outside vendor/");
        } else if (cited !== actual) {
          report(hook, `citation is stale: cited at ${cited}, the manifest has ${actual}`, {
            cited,
            actual,
          });
        }
        if (reached === undefined) {
          report(hook, "sits on a constructor whose file and name mirror no Rails class or module");
        } else if (reached.sameFile.includes(hook)) {
          report(hook, "is redundant: a body from the mirrored Ruby file is inlined untagged");
        } else if (!reached.tagged.includes(hook)) {
          report(
            hook,
            `names a module ${counterpart!.fqn} does not ${tag.hook === "new" ? "extend" : "include or prepend"}`,
          );
        }
      }
      if (!enrolled.includes(name)) continue;
      for (const hook of reached?.tagged ?? []) {
        if (tags.some((tag) => `${tag.module}#${tag.hook}` === hook)) continue;
        report(hook, `is inlined untagged: ${counterpart!.fqn} reaches it from another Ruby file`);
      }
    }
  }
  return findings;
}

/** `text` with each stale citation among `findings` replaced by the manifest's. */
export function fixCitations(text: string, findings: readonly InlinedFromFinding[]): string {
  return findings.reduce(
    (fixed, { hook, fix }) =>
      fix === undefined
        ? fixed
        : fixed.replaceAll(`${TAG} ${hook} ${fix.cited}`, `${TAG} ${hook} ${fix.actual}`),
    text,
  );
}

async function main(fix: boolean): Promise<number> {
  const read = async (name: string) =>
    JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, name), "utf-8")) as ApiManifest;
  let findings = inlinedFromFindings(await read("rails-api.json"), await read("ts-api.json"));
  if (fix) {
    const files = new Set(findings.filter((f) => f.fix).map((f) => `${f.package}\0${f.tsFile}`));
    for (const key of files) {
      const [pkg, tsFile] = key.split("\0");
      const file = path.join(packageSrcDir(pkg), tsFile);
      const here = findings.filter((f) => f.package === pkg && f.tsFile === tsFile);
      await fs.writeFile(file, fixCitations(await fs.readFile(file, "utf-8"), here));
      console.log(`rewrote ${path.relative(ROOT_DIR, file)}`);
    }
    findings = findings.filter((f) => f.fix === undefined);
  }
  for (const f of findings) {
    console.error(
      `  ${f.package}/${f.tsFile} ${f.owner}#constructor: ${TAG} ${f.hook} ${f.message}`,
    );
  }
  if (findings.length > 0) {
    console.error(
      `\ninlined-from gate: ${findings.length} finding(s). A stale citation is rewritten by ` +
        "`pnpm parity:api:inlined:fix`; every other one is fixed at the constructor.",
    );
    return 1;
  }
  console.log("inlined-from gate: OK");
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  process.exit(await main(process.argv.includes("--fix")));
}

void runAsScript();
