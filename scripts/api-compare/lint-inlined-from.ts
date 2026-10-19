#!/usr/bin/env npx tsx
/**
 * CI gate for `@inlinedFrom` staleness, both ways (RFC 0188).
 *
 * A tag is red when it names a `def` the Rails manifest does not hold, cites
 * that `def` at another path or line span, names a module the Rails
 * counterpart of its class neither includes, prepends nor extends, names a
 * `def` in the Ruby file the constructor's own file mirrors, or sits twice or
 * out of Ruby's chain order. A tag on a method (RFC 0197) is held to the same
 * checks against the class's ancestors that define the method, and is red too
 * when the module method's Rails body calls no `super`. `--fix` rewrites
 * a stale citation from the manifest, which is the only place one comes from.
 *
 * The reverse arm, a Rails class that reaches a module `initialize` or a
 * `ClassMethods#new` in ANOTHER Ruby file and whose constructor carries no tag
 * for it, gates the packages in {@link MISSING_TAG_PACKAGES} only. An
 * `initialize` that calls no `super` ends the chain: `RoutesProxy#initialize`
 * (`action_dispatch/routing/routes_proxy.rb:15-19`) never reaches
 * `Routing::UrlFor#initialize`. The Ruby extractor writes `calls` only when a
 * body makes one, so a `def` read with a line span and no `calls` calls
 * nothing; an entry with no line span is taken to call `super`.
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
import type { ApiManifest, ClassInfo, InlinedFrom, MethodInfo } from "@blazetrails/parity/types";
import { rubyFileToTs } from "@blazetrails/parity/conventions";
import { resolveModuleName } from "./compare.js";
import { OUTPUT_DIR, ROOT_DIR, packageSrcDir } from "./config.js";
import {
  INLINED_FROM_PAIRS_FILE,
  moduleAncestors,
  shortName,
  type InlinedFromPair,
} from "./inlined-bodies.js";
import { TAG } from "./inlined-from-tags.js";

/**
 * The packages whose missing-tag arm gates. Only-grow: a package joins in the
 * PR that converts its constructors, and none leaves to turn a red run green.
 */
export const MISSING_TAG_PACKAGES: readonly string[] = [
  "actioncontroller",
  "actiondispatch",
  "actionview",
  "activerecord",
  "activejob",
  "activesupport",
  "i18n",
  "rack",
  "rack-test",
  "thor",
  "trailties",
];

export interface InlinedFromFinding {
  package: string;
  tsFile: string;
  owner: string;
  /** The tagged TS member, when it is not the constructor. */
  member?: string;
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

const defines = (entity: Entity | undefined, hook: string) =>
  entity?.info.instanceMethods.find((m) => m.name === hook);

/**
 * A module's nested `ClassMethods` is extended onto its includer by
 * `ActiveSupport::Concern#append_features` / `#prepend_features`
 * (`activesupport/lib/active_support/concern.rb:129-150`) and by nothing else,
 * at the moment of the `include`. So the singleton side of the chain is the
 * class's `extend` and Concern `include` statements read last first, the
 * first argument of one statement ahead of its second. A prepended Concern's
 * `ClassMethods` is prepended to the singleton class (`concern.rb:142-150`),
 * so it runs ahead of every one of those.
 */
export const CONCERN = "ActiveSupport::Concern";

function reachedHooks(entity: Entity, modules: ReadonlyMap<string, Entity>) {
  const byShort = new Map<string, string[]>();
  for (const fqn of modules.keys()) {
    const short = shortName(fqn);
    byShort.set(short, [...(byShort.get(short) ?? []), fqn]);
  }
  const resolve = (name: string, context: string) => resolveModuleName(name, context, byShort);
  const infos = Object.fromEntries([...modules].map(([fqn, mod]) => [fqn, mod.info]));
  const ancestors = moduleAncestors(entity.info, entity.fqn, infos, resolve);
  const callsSuper = (body: MethodInfo | undefined) =>
    body?.line === undefined || (body.calls ?? []).includes("super");
  const behind = (fqns: readonly string[]) => {
    const at = fqns.findIndex((fqn) => !callsSuper(defines(modules.get(fqn), "initialize")));
    return at === -1 ? undefined : fqns.slice(0, at + 1);
  };
  const prepended = behind(ancestors.prepended);
  const mixed =
    prepended ??
    (callsSuper(defines(entity, "initialize"))
      ? [...ancestors.prepended, ...(behind(ancestors.included) ?? ancestors.included)]
      : ancestors.prepended);
  const concerns = (name: string): string[] => {
    const own = moduleAncestors({ includes: [name] } as ClassInfo, entity.fqn, infos, resolve);
    return [...own.prepended, ...own.included]
      .filter((fqn) =>
        (modules.get(fqn)?.info.extends ?? []).some((ext) => resolve(ext, fqn) === CONCERN),
      )
      .map((fqn) => `${fqn}::ClassMethods`);
  };
  const statements = [...(entity.info.mixinOrder ?? [])].reverse();
  const singleton = [
    ...statements.filter(({ kind }) => kind === "prepend"),
    ...statements.filter(({ kind }) => kind !== "prepend"),
  ].flatMap(({ kind, names }) =>
    names.flatMap((name) => (kind === "extend" ? [resolve(name, entity.fqn)] : concerns(name))),
  );
  const reached = { tagged: [] as string[], sameFile: [] as string[] };
  const sort = (fqns: readonly string[], hook: string) => {
    for (const fqn of new Set(fqns)) {
      const mod = modules.get(fqn);
      if (hook === "new" && !fqn.endsWith("::ClassMethods")) continue;
      if (defines(mod, hook) === undefined) continue;
      const sameFile = mod!.package === entity.package && mod!.info.file === entity.info.file;
      (sameFile ? reached.sameFile : reached.tagged).push(`${fqn}#${hook}`);
    }
  };
  sort(singleton, "new");
  sort(mixed, "initialize");
  return reached;
}

/**
 * The modules in `entity`'s ancestors that define `hook`, in Ruby's lookup
 * order, split by whether each lives in `entity`'s own Ruby file.
 */
function methodChain(entity: Entity, hook: string, modules: ReadonlyMap<string, Entity>) {
  const byShort = new Map<string, string[]>();
  for (const fqn of modules.keys()) {
    const short = shortName(fqn);
    byShort.set(short, [...(byShort.get(short) ?? []), fqn]);
  }
  const infos = Object.fromEntries([...modules].map(([fqn, mod]) => [fqn, mod.info]));
  const ancestors = moduleAncestors(entity.info, entity.fqn, infos, (name, context) =>
    resolveModuleName(name, context, byShort),
  );
  const chain = { tagged: [] as string[], sameFile: [] as string[] };
  for (const fqn of [...ancestors.prepended, ...ancestors.included]) {
    const mod = modules.get(fqn);
    if (defines(mod, hook) === undefined) continue;
    const sameFile = mod!.package === entity.package && mod!.info.file === entity.info.file;
    (sameFile ? chain.sameFile : chain.tagged).push(`${fqn}#${hook}`);
  }
  return chain;
}

/**
 * Every finding over the two manifests; `enrolled` gates the missing-tag arm.
 * A constructor in `pairs` takes the Rails class compare.ts compared it
 * against, so the two gates never pair it differently; any other is paired by
 * file and short name.
 */
export function inlinedFromFindings(
  ruby: ApiManifest,
  ts: ApiManifest,
  enrolled: readonly string[] = MISSING_TAG_PACKAGES,
  pairs: readonly InlinedFromPair[] = [],
): InlinedFromFinding[] {
  const modules = new Map(entities(ruby, "modules").map((mod) => [mod.fqn, mod]));
  const rubyEntities = [...entities(ruby, "classes"), ...modules.values()];
  const findings: InlinedFromFinding[] = [];
  const visited = new Set<string>();
  for (const [name, pkg] of Object.entries(ts.packages)) {
    for (const [owner, klass] of Object.entries(pkg.classes) as unknown as [string, ClassInfo][]) {
      const ctor = klass.instanceMethods.find((m) => m.name === "constructor");
      const tags = ctor?.inlinedFrom ?? [];
      const methods = klass.instanceMethods.filter(
        (m) => m.name !== "constructor" && m.inlinedFrom !== undefined,
      );
      if (tags.length === 0 && methods.length === 0 && !enrolled.includes(name)) continue;
      if (ctor?.file !== undefined && klass.file !== undefined && ctor.file !== klass.file)
        continue;
      const tsFile = ctor?.file ?? klass.file;
      if (tsFile === undefined) continue;
      const short = shortName(klass.name ?? owner);
      const seat = `${name} ${tsFile} ${klass.name ?? owner}`;
      if (visited.has(seat)) continue;
      visited.add(seat);
      const mirrored = rubyEntities.filter(
        (entity) =>
          entity.package === name &&
          entity.info.file !== undefined &&
          rubyFileToTs(entity.info.file, name) === tsFile,
      );
      const classes = mirrored.filter((entity) => !modules.has(entity.fqn));
      const declared = Object.values(pkg.classes).filter(
        (other) => (other as unknown as ClassInfo).file === tsFile,
      );
      const pairedWith = pairs.filter(
        (pair) =>
          pair.package === name && pair.tsFile === tsFile && pair.owner === (klass.name ?? owner),
      );
      const paired = pairedWith[0];
      if (pairedWith.length > 1) {
        const fqns = pairedWith.map((pair) => pair.rubyModule).join(", ");
        throw new Error(`${TAG} on ${name}/${tsFile} ${owner} was compared against ${fqns}`);
      }
      const counterpart =
        (paired && rubyEntities.find((e) => e.package === name && e.fqn === paired.rubyModule)) ??
        mirrored.find((entity) => entity.fqn.split("::").pop() === short) ??
        (classes.length === 1 && declared.length === 1 ? classes[0] : undefined);
      const reached = counterpart && reachedHooks(counterpart, modules);
      let member: string | undefined;
      const report = (hook: string, message: string, fix?: InlinedFromFinding["fix"]) =>
        findings.push({
          package: name,
          tsFile,
          owner,
          ...(member === undefined ? {} : { member }),
          hook,
          message,
          ...(fix ? { fix } : {}),
        });
      const resolveBody = (tag: InlinedFrom): MethodInfo | undefined => {
        const hook = `${tag.module}#${tag.hook}`;
        const body = defines(modules.get(tag.module), tag.hook);
        if (body === undefined) {
          report(hook, "names no Ruby body: the manifest has no such `def`");
          return undefined;
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
        return body;
      };
      const checkOrder = (written: readonly InlinedFrom[], chain: readonly string[]) => {
        const placed = written.map((tag) => chain.indexOf(`${tag.module}#${tag.hook}`));
        placed.forEach((at, index) => {
          if (at === -1) return;
          const earlier = placed.slice(0, index).filter((other) => other !== -1);
          if (earlier.includes(at)) {
            report(chain[at], "is tagged more than once: Rails runs the body once");
          } else if (earlier.some((other) => other > at)) {
            const after = chain[Math.max(...earlier)];
            report(chain[at], `is out of chain order: Rails runs it before ${after}`);
          }
        });
      };
      for (const tagged of methods) {
        member = tagged.name;
        const written = tagged.inlinedFrom ?? [];
        const chain = counterpart && methodChain(counterpart, written[0]?.hook ?? "", modules);
        for (const tag of written) {
          const hook = `${tag.module}#${tag.hook}`;
          if (tag.hook !== written[0].hook) {
            report(hook, `names a method other than ${written[0].hook}, which the other tags name`);
            continue;
          }
          const body = resolveBody(tag);
          if (body === undefined) continue;
          if (!(body.calls ?? []).includes("super")) {
            report(hook, "names a module method whose Rails body calls no `super`");
          }
          if (chain === undefined) {
            report(hook, "sits on a method whose file and name mirror no Rails class or module");
          } else if (chain.sameFile.includes(hook)) {
            report(hook, "is redundant: a body from the mirrored Ruby file is inlined untagged");
          } else if (!chain.tagged.includes(hook)) {
            report(hook, `names a module ${counterpart!.fqn} does not include or prepend`);
          }
        }
        checkOrder(written, chain?.tagged ?? []);
      }
      member = undefined;
      for (const tag of tags) {
        const hook = `${tag.module}#${tag.hook}`;
        if (resolveBody(tag) === undefined) continue;
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
      const chain = reached?.tagged ?? [];
      checkOrder(tags, chain);
      if (!enrolled.includes(name)) continue;
      for (const hook of chain) {
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
  const pairsPath = path.join(OUTPUT_DIR, INLINED_FROM_PAIRS_FILE);
  const pairs = await fs
    .readFile(pairsPath, "utf-8")
    .then((text) => JSON.parse(text) as InlinedFromPair[])
    .catch((error: unknown) => {
      throw new Error(
        `${TAG} gate cannot read ${pairsPath}: run \`pnpm parity:api --calls\` first (${String(error)})`,
      );
    });
  let findings = inlinedFromFindings(
    await read("rails-api.json"),
    await read("ts-api.json"),
    MISSING_TAG_PACKAGES,
    pairs,
  );
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
      `  ${f.package}/${f.tsFile} ${f.owner}#${f.member ?? "constructor"}: ${TAG} ${f.hook} ${f.message}`,
    );
  }
  if (findings.length > 0) {
    console.error(
      `\ninlined-from gate: ${findings.length} finding(s). A stale citation is rewritten by ` +
        "`pnpm parity:api:inlined:fix`; every other one is fixed at the tagged member.",
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
