/**
 * The gem a codegen run converts, from `CODEGEN_GEM` (default `activerecord`).
 * Every script in the pipeline reads it from here, so one variable switches the
 * Ruby source, the output package, the type oracle and the measurements.
 *
 *   CODEGEN_GEM=activejob pnpm tsx scripts/codegen/src/cli.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface GemConfig {
  /** The vendored gem directory and the trails package name (`activerecord`). */
  gem: string;
  /** The gem's top-level Ruby file and directory under lib (`active_record`). */
  rubyRoot: string;
  /** The gem's top-level Ruby namespace (`ActiveRecord`). */
  namespace: string;
}

const GEMS: Record<string, GemConfig> = {
  activerecord: { gem: "activerecord", rubyRoot: "active_record", namespace: "ActiveRecord" },
  activejob: { gem: "activejob", rubyRoot: "active_job", namespace: "ActiveJob" },
};

const name = process.env.CODEGEN_GEM ?? "activerecord";
const cfg = GEMS[name];
if (!cfg) throw new Error(`CODEGEN_GEM=${name}: known gems are ${Object.keys(GEMS).join(", ")}`);

export const GEM: GemConfig = cfg;
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
/** `vendor/rails/v8.0.2/<gem>/lib`. */
export const GEM_LIB = path.join(ROOT, "vendor/rails/v8.0.2", GEM.gem, "lib");
/** `packages/<gem>`, the hand port. */
export const PKG_DIR = path.join(ROOT, "packages", GEM.gem);
/** `packages/<gem>/codegen-out`, where a run writes. */
export const GEN_DIR = path.join(PKG_DIR, "codegen-out");
/** The `@inlinedFrom` citation prefix for a `def` in this gem. */
export const CITE_PREFIX = `rails/v8.0.2/${GEM.gem}/lib`;
/** The type oracle read from this gem's hand port (activerecord keeps its original name). */
export const ORACLE_PATH = path.join(
  ROOT,
  "scripts/codegen/data",
  GEM.gem === "activerecord" ? "hand-oracle.json" : `hand-oracle-${GEM.gem}.json`,
);

let seatFqnsMemo: Map<string, string> | undefined;
/**
 * The namespace objects the hand port seats in its zero-import `namespaces.ts`
 * (CLAUDE.md, "Call-time constant resolution"), by Ruby fqn → export name:
 * `export const QueueAdapters = { name: "ActiveJob::QueueAdapters", … }`.
 */
export function handNamespaceFqns(): Map<string, string> {
  if (seatFqnsMemo) return seatFqnsMemo;
  const f = path.join(PKG_DIR, "src/namespaces.ts");
  const text = existsSync(f) ? readFileSync(f, "utf8") : "";
  seatFqnsMemo = new Map();
  for (const m of text.matchAll(/export const ([A-Z]\w*)\s*=\s*\{\s*name:\s*"([A-Za-z:]+)"/g))
    seatFqnsMemo.set(m[2], m[1]);
  return seatFqnsMemo;
}

let handAutoloadsMemo: Set<string> | undefined;
/** `Seat.autoload("X")` calls in the hand port's `namespaces.ts`, as `Seat::X`. */
export function handNamespaceAutoloads(): Set<string> {
  if (handAutoloadsMemo) return handAutoloadsMemo;
  const f = path.join(PKG_DIR, "src/namespaces.ts");
  const text = existsSync(f) ? readFileSync(f, "utf8") : "";
  handAutoloadsMemo = new Set(
    [...text.matchAll(/\b([A-Z]\w*)\.autoload\("([A-Z]\w*)"/g)].map((m) => `${m[1]}::${m[2]}`),
  );
  return handAutoloadsMemo;
}

let coreExtMemo: Set<string> | undefined;
/**
 * Methods activesupport seats on ruby-compat's primitive method tables
 * (`STRING_METHOD_TABLE.inTimeZone = …`, `Object.assign(TEMPORAL_METHOD_TABLE[seat],
 * { inTimeZone })`), which `rbFSend` dispatches on a string or Temporal receiver:
 * the trails spelling of a core_ext method on `String` / `Time` / `Date`.
 */
export function coreExtSends(): Set<string> {
  if (coreExtMemo) return coreExtMemo;
  coreExtMemo = new Set();
  const dir = path.join(ROOT, "packages/activesupport/src");
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(path.join(d, e.name))
        : /\.ts$/.test(e.name) && !/test/.test(e.name)
          ? [path.join(d, e.name)]
          : [],
    );
  for (const f of walk(dir)) {
    const t = readFileSync(f, "utf8");
    for (const m of t.matchAll(
      /(?:STRING|TEMPORAL|ARRAY)_METHOD_TABLE(?:\[[^\]]+\])?(?: \?\?= \{\}\))?\.(\w+) =/g,
    ))
      coreExtMemo.add(m[1]);
    for (const m of t.matchAll(
      /Object\.assign\(\s*\(?(?:STRING|TEMPORAL|ARRAY)_METHOD_TABLE[^,]*,\s*\{([^}]*)\}/g,
    ))
      for (const k of m[1].split(",")) {
        const name = k.split(":")[0].trim();
        if (/^\w+$/.test(name)) coreExtMemo.add(name);
      }
  }
  return coreExtMemo;
}
