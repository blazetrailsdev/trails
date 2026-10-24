/**
 * The gem a codegen run converts, from `CODEGEN_GEM` (default `activerecord`).
 * Every script in the pipeline reads it from here, so one variable switches the
 * Ruby source, the output package, the type oracle and the measurements.
 *
 *   CODEGEN_GEM=activejob pnpm tsx scripts/codegen/src/cli.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface GemConfig {
  /**
   * The gem's library branches on Symbol-ness (builder's
   * `args.first.kind_of?(::Symbol)`), so every file keeps a Symbol's colon
   * (CLAUDE.md, "A Ruby Symbol is a JS string").
   */
  symbolColon?: boolean;
  /**
   * Symbol keys of the gem's data hashes keep their colon (`job_data[:job]` is
   * `jobData[":job"]`), where they meet String keys (`job.serialize`) and are
   * read back by key; option hashes keep bare camelCase keys (CLAUDE.md, the
   * `symbolize_keys` rule). The hand activejob port's spelling.
   */
  dataHashColon?: boolean;
  /**
   * The gem's source directories, relative to its vendored root: `lib`, and for
   * an engine its models (`app/models`, solid_queue). Each file is named by its
   * path under its directory (`solid_queue/job.rb`), so lib and app share a tree.
   */
  libDirs?: string[];
  /**
   * Other top-level directories of the gem's lib it ports besides `rubyRoot`:
   * solid_queue's `active_job/` (its queue adapter and `ConcurrencyControls`,
   * which it adds to ActiveJob).
   */
  extraRoots?: string[];
  /**
   * An engine's database schema, relative to its vendored root: its models'
   * columns, and the table each model reads them from (Rails' attribute
   * methods come from the table, not the class body).
   */
  schema?: string;
  /**
   * Classes Rails turns back into a class from a name in data (`constantize` on
   * a serialized job's `job_class`, an `_aj_serialized` serializer, a GlobalID's
   * model): a class with one of these among its Ruby ancestors or includes is
   * entered in ruby-compat's constant registry by its Ruby path. Nothing else
   * is seated; every other constant is an import.
   */
  namedClasses?: string[];
  /** The engine's `isolate_namespace` table prefix (`solid_queue_`). */
  tablePrefix?: string;
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
  /**
   * A gem the tests use that trails does not port, by name → the constants it
   * defines or the tests alias it as. The test files' setup naming one is
   * dropped, and an example that reaches one is emitted `it.skip` under a
   * `HAND-PORT:` line, left for a hand port.
   */
  handPortGems?: Record<string, string[]>;
  /** The package directory under `packages/`, where it differs from `gem` (`image-processing`). */
  pkg?: string;
  /** The gem's test directory beside `lib/`: `test` (Minitest), or `spec` (RSpec). */
  testDir?: string;
  /**
   * A Ruby library the gem binds, by its top-level constant, as the npm package
   * standing in for it: the default export, initialised once per file
   * (`const vips = await Vips();`), with the constants and singleton methods
   * the Ruby library defines in Ruby rather than in the bound C library.
   */
  externals?: Record<string, External>;
}

export interface External {
  module: string;
  importName: string;
  local: string;
  init: string;
  /** `Lib::NAME` → its JS expression. */
  consts?: Record<string, string>;
  /** `Lib.method(args)` → its JS expression. */
  calls?: Record<string, (args: string[], local: string) => string>;
}

const GEMS: Record<string, GemConfig> = {
  activerecord: { gem: "activerecord", rubyRoot: "active_record", namespace: "ActiveRecord" },
  activejob: {
    gem: "activejob",
    rubyRoot: "active_job",
    namespace: "ActiveJob",
    dataHashColon: true,
    namedClasses: [
      "ActiveJob::Base",
      "ActiveJob::Serializers::ObjectSerializer",
      "GlobalID::Identification",
    ],
  },
};

// image_processing (janko/image_processing v1.14.0, vendor/rails/v8.0.2/Gemfile.lock:289),
// RFC 0202: no hand port yet.
GEMS.image_processing = {
  gem: "image_processing",
  rubyRoot: "image_processing",
  namespace: "ImageProcessing",
  vendor: "image_processing/v1.14.0",
  hand: false,
  pkg: "image-processing",
  // ruby-vips over npm wasm-vips (RFC 0202, owner ruling 2026-10-21). wasm-vips
  // binds libvips' object model as ruby-vips does; what ruby-vips writes in
  // Ruby is ported from its lib/vips.rb (v2.2.3).
  externals: {
    Vips: {
      module: "wasm-vips",
      // Not `Vips`: that is `ImageProcessing::Vips` in vips.rb.
      importName: "WasmVips",
      local: "vips",
      init: "await WasmVips()",
      consts: {
        // vips.rb:621 `class Error < RuntimeError`: wasm-vips throws a JS Error
        // (`globalThis.`: the file imports `ImageProcessing::Error` as `Error`).
        Error: "globalThis.Error",
        // vips.rb:863
        MAX_COORD: "10_000_000",
      },
      calls: {
        // vips.rb:805-810 `major = version(0); minor = version(1)`.
        "at_least_libvips?": ([x, y], v) =>
          `(Number(${v}.version(0)) > ${x} || (Number(${v}.version(0)) === ${x} && Number(${v}.version(1)) >= ${y}))`,
      },
    },
  },
};

// mini_magick (minimagick/minimagick v5.2.0, vendor/rails/v8.0.2/Gemfile.lock:352),
// RFC 0202: shells out to ImageMagick; its specs are RSpec.
GEMS.mini_magick = {
  gem: "mini_magick",
  rubyRoot: "mini_magick",
  namespace: "MiniMagick",
  vendor: "mini_magick/v5.2.0",
  hand: false,
  pkg: "mini-magick",
  testDir: "spec",
};

// builder (rails/builder v3.3.0, vendor/rails/v8.0.2/Gemfile.lock:156):
// actionview's `.builder` templates and activesupport's `to_xml`.
GEMS.builder = {
  gem: "builder",
  rubyRoot: "builder",
  namespace: "Builder",
  vendor: "builder/v3.3.0",
  hand: false,
  symbolColon: true,
  pkg: "builder",
};

// fugit (floraison/fugit v1.11.1, vendor/rails/v8.0.2/Gemfile.lock:234): solid_queue's
// recurring-task schedules (`Fugit.parse`, `Fugit::Cron`), on raabro's parser
// combinators and et-orbi's zoned times, each a generator target of its own.
GEMS.raabro = {
  gem: "raabro",
  rubyRoot: "raabro",
  namespace: "Raabro",
  vendor: "raabro/v1.4.0",
  hand: false,
  pkg: "raabro",
  testDir: "spec",
};
GEMS.et_orbi = {
  // The specs' natural-language times (`Khronic.parse`), a development dependency.
  handPortGems: { chronic: ["Chronic", "Khronic"] },
  gem: "et_orbi",
  rubyRoot: "et-orbi",
  namespace: "EtOrbi",
  vendor: "et-orbi/v1.2.11",
  hand: false,
  pkg: "et-orbi",
  testDir: "spec",
};
GEMS.fugit = {
  // The specs' natural-language times (`Khronic.parse`), a development dependency.
  handPortGems: { chronic: ["Chronic", "Khronic"] },
  gem: "fugit",
  rubyRoot: "fugit",
  namespace: "Fugit",
  vendor: "fugit/v1.11.1",
  hand: false,
  pkg: "fugit",
  testDir: "spec",
};

// solid_queue (rails/solid_queue v1.1.3, vendor/rails/v8.0.2/Gemfile.lock:586),
// RFC 0196: the database-backed ActiveJob backend, an engine whose models are
// in app/models.
GEMS.solid_queue = {
  gem: "solid_queue",
  rubyRoot: "solid_queue",
  namespace: "SolidQueue",
  vendor: "solid_queue/v1.1.3",
  pkg: "solid-queue",
  libDirs: ["lib", "app/models"],
  extraRoots: ["active_job"],
  schema: "lib/generators/solid_queue/install/templates/db/queue_schema.rb",
  tablePrefix: "solid_queue_",
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
/** Every source directory of the gem (`GemConfig.libDirs`), `GEM_LIB` first. */
export const GEM_LIB_DIRS = (GEM.libDirs ?? ["lib"]).map((d) =>
  path.join(ROOT, "vendor", GEM_ROOT, d),
);
/** `GemConfig.schema`, resolved. */
export const GEM_SCHEMA = GEM.schema ? path.join(ROOT, "vendor", GEM_ROOT, GEM.schema) : null;
/** `packages/<gem>`, the hand port. */
export const PKG_DIR = path.join(ROOT, "packages", GEM.pkg ?? GEM.gem);
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
  return GEM.hand !== false && existsSync(hand) ? hand : SYNTH_SEATS;
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

/**
 * Another generated gem whose namespace a constant root names (fugit's `EtOrbi`,
 * `Raabro`): its package, and each name its generated tree exports mapped to the
 * module specifier that exports it.
 */
export interface DepGem {
  pkg: string;
  exports: Map<string, string>;
  /** Whether its Ruby defines a `method_added` hook (Raabro's root-rule tracking). */
  methodAdded: boolean;
}
const depGems = new Map<string, DepGem | null>();
export function depGem(root: string): DepGem | null {
  if (depGems.has(root)) return depGems.get(root)!;
  let found: DepGem | null = null;
  const dep = Object.values(GEMS).find((g) => g.namespace === root && g !== GEM && g.vendor);
  if (dep) {
    const pkg = dep.pkg ?? dep.gem.replace(/_/g, "-");
    const src = path.join(ROOT, "packages", pkg, "codegen-out", "src");
    if (existsSync(src)) {
      const exports = new Map<string, string>();
      const entry = `${dep.rubyRoot}.ts`;
      const files = readdirSync(src, { recursive: true, encoding: "utf8" })
        .filter(
          (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.startsWith("test-helpers"),
        )
        .sort((a, b) => (a === entry ? -1 : b === entry ? 1 : a.localeCompare(b)));
      for (const f of files) {
        const spec = `@blazetrails/${pkg}${f === entry ? "" : `/${f.replace(/\.ts$/, "")}`}`;
        for (const m of readFileSync(path.join(src, f), "utf8").matchAll(
          /^export (?:abstract )?(?:class|function|const|let) (\w+)/gm,
        ))
          if (!exports.has(m[1])) exports.set(m[1], spec);
      }
      const lib = path.join(ROOT, "vendor", dep.vendor!, "lib");
      const methodAdded =
        existsSync(lib) &&
        readdirSync(lib, { recursive: true, encoding: "utf8" }).some(
          (f) =>
            f.endsWith(".rb") &&
            /^\s*def method_added\b/m.test(readFileSync(path.join(lib, f), "utf8")),
        );
      found = { pkg, exports, methodAdded };
    }
  }
  depGems.set(root, found);
  return found;
}
