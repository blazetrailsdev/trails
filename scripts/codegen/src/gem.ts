/**
 * The gem a codegen run converts, from `CODEGEN_GEM` (default `activerecord`).
 * Every script in the pipeline reads it from here, so one variable switches the
 * Ruby source, the output package, the type oracle and the measurements.
 *
 *   CODEGEN_GEM=activejob pnpm tsx scripts/codegen/src/cli.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface GemConfig {
  /** The vendored gem directory and the trails package name (`activerecord`). */
  gem: string;
  /** The gem's top-level Ruby file and directory under lib (`active_record`). */
  rubyRoot: string;
  /** The gem's top-level Ruby namespace (`ActiveRecord`). */
  namespace: string;
  /**
   * A gem vendored outside Rails: its source and version under `vendor/`
   * (`marcel/v1.0.4`). Omitted for a Rails framework gem.
   */
  vendor?: string;
  /** False for a gem trails has no hand port of (marcel): no oracle of its own. */
  hand?: false;
  /**
   * Tests that cannot run against what trails ports, by test name: each is
   * emitted `it.skip` under a `PERMANENT-SKIP:` line giving the reason.
   */
  skipTests?: Record<string, string>;
}

const GEMS: Record<string, GemConfig> = {
  activerecord: { gem: "activerecord", rubyRoot: "active_record", namespace: "ActiveRecord" },
  activejob: { gem: "activejob", rubyRoot: "active_job", namespace: "ActiveJob" },
  marcel: {
    gem: "marcel",
    rubyRoot: "marcel",
    namespace: "Marcel",
    vendor: "marcel/v1.0.4",
    hand: false,
    skipTests: {
      "gets content type from sources that conform to Rack::Lint::InputWrapper":
        "Rack::Lint::InputWrapper is rack 2 (marcel.gemspec:25 `rack ~> 2.0`); trails ports rack 3.1.14, where it is Rack::Lint::Wrapper::InputWrapper (vendor/rack/v3.1.14/lib/rack/lint.rb:44, :445)",
    },
  },
};

const name = process.env.CODEGEN_GEM ?? "activerecord";
const cfg = GEMS[name];
if (!cfg) throw new Error(`CODEGEN_GEM=${name}: known gems are ${Object.keys(GEMS).join(", ")}`);

export const GEM: GemConfig = cfg;
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
/** The gem's vendored root: `vendor/rails/v8.0.2/<gem>`, or `vendor/<vendor>`. */
const GEM_ROOT = GEM.vendor ?? `rails/v8.0.2/${GEM.gem}`;
/** `vendor/rails/v8.0.2/<gem>/lib`. */
export const GEM_LIB = path.join(ROOT, "vendor", GEM_ROOT, "lib");
/** `packages/<gem>`, the hand port. */
export const PKG_DIR = path.join(ROOT, "packages", GEM.gem);
/** `packages/<gem>/codegen-out`, where a run writes. */
export const GEN_DIR = path.join(PKG_DIR, "codegen-out");
/** The `@inlinedFrom` citation prefix for a `def` in this gem. */
export const CITE_PREFIX = `${GEM_ROOT}/lib`;
/** The type oracle read from this gem's hand port (activerecord keeps its original name). */
export const ORACLE_PATH = path.join(
  ROOT,
  "scripts/codegen/data",
  GEM.gem === "activerecord" ? "hand-oracle.json" : `hand-oracle-${GEM.gem}.json`,
);

/**
 * The hand port's `namespaces.ts`, or, for a gem with no hand port (marcel),
 * the seat file the CLI synthesizes in its place (`SYNTH_SEATS`).
 */
export const SYNTH_SEATS = path.join(GEN_DIR, "namespaces.synth.ts");
function seatsFile(): string {
  const hand = path.join(PKG_DIR, "src/namespaces.ts");
  return existsSync(hand) ? hand : SYNTH_SEATS;
}

let seatFqnsMemo: Map<string, string> | undefined;
/**
 * The namespace objects the hand port seats in its zero-import `namespaces.ts`
 * (CLAUDE.md, "Call-time constant resolution"), by Ruby fqn → export name:
 * `export const QueueAdapters = { name: "ActiveJob::QueueAdapters", … }`.
 */
export function handNamespaceFqns(): Map<string, string> {
  if (seatFqnsMemo) return seatFqnsMemo;
  const f = seatsFile();
  const text = existsSync(f) ? readFileSync(f, "utf8") : "";
  seatFqnsMemo = new Map();
  for (const m of text.matchAll(/export const ([A-Z]\w*)\s*=\s*\{\s*name:\s*"([A-Za-z:]+)"/g))
    seatFqnsMemo.set(m[2], m[1]);
  return seatFqnsMemo;
}

let seatMembersMemo: Map<string, Set<string>> | undefined;
/**
 * The members each seat's type declares in the hand port's `namespaces.ts`
 * (`export const ActiveJob = { … } as AutoloadModule & { Arguments: …; … }`),
 * by export name: a constant reached through the seat must be one of them.
 */
export function handSeatMembers(): Map<string, Set<string>> {
  if (seatMembersMemo) return seatMembersMemo;
  const f = seatsFile();
  const text = existsSync(f) ? readFileSync(f, "utf8") : "";
  seatMembersMemo = new Map();
  for (const m of text.matchAll(
    /export const ([A-Z]\w*)\s*=\s*\{[^}]*\}\s*as[^{;]*&\s*\{([^}]*)\}/g,
  ))
    seatMembersMemo.set(m[1], new Set([...m[2].matchAll(/^\s*([\w$]+)\??:/gm)].map((x) => x[1])));
  return seatMembersMemo;
}

let handAutoloadsMemo: Set<string> | undefined;
/** `Seat.autoload("X")` calls in the hand port's `namespaces.ts`, as `Seat::X`. */
export function handNamespaceAutoloads(): Set<string> {
  if (handAutoloadsMemo) return handAutoloadsMemo;
  const f = seatsFile();
  const text = existsSync(f) ? readFileSync(f, "utf8") : "";
  handAutoloadsMemo = new Set(
    [...text.matchAll(/\b([A-Z]\w*)\.autoload\("([A-Z]\w*)"/g)].map((m) => `${m[1]}::${m[2]}`),
  );
  return handAutoloadsMemo;
}

let coreExtMemo: Set<string> | undefined;
/**
 * Methods seated on ruby-compat's primitive method tables (`STRING_METHOD_TABLE`,
 * `TEMPORAL_METHOD_TABLE[seat]`, `ARRAY_METHOD_TABLE`), which `rbFSend`
 * dispatches on a string, Temporal or array receiver: the trails spelling of a
 * core_ext method on `String` / `Time` / `Date`. Read off the tables once
 * activesupport (and through it `date`) has loaded, in a child process because
 * the built packages are ESM.
 */
export function coreExtSends(): Set<string> {
  if (coreExtMemo) return coreExtMemo;
  // Only what activesupport and `date` seat: ruby-compat's own bindings
  // (`each`, `isEmpty`) have native lowerings of their own.
  const script = `
    const rc = await import("@blazetrails/ruby-compat");
    const names = () => new Set([
      ...Object.keys(rc.STRING_METHOD_TABLE),
      ...Object.keys(rc.ARRAY_METHOD_TABLE),
      ...Object.values(rc.TEMPORAL_METHOD_TABLE).flatMap((t) => Object.keys(t)),
    ]);
    const own = names();
    await import("@blazetrails/activesupport");
    process.stdout.write(JSON.stringify([...names()].filter((n) => !own.has(n))));`;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: path.join(ROOT, "packages/activesupport"),
    encoding: "utf8",
  });
  coreExtMemo = new Set(JSON.parse(out) as string[]);
  return coreExtMemo;
}
