/**
 * Dump the committed db/schema.ts as a TypeScript module declaring one
 * `@blazetrails/activerecord` model class per table, with belongsTo /
 * hasMany associations inferred from foreign keys.
 *
 * Usage:
 *   ar models:dump [--schema <path>] [--out <path>]
 *                  [--ignore t1,t2] [--only t1,t2]
 *                  [--strip-prefix <str>] [--strip-suffix <str>]
 *                  [--no-header] [--format]
 *
 * Schema source, in order:
 *   1. --schema <path>   parse the given db/schema.ts (explicit)
 *   2. db/schema.ts      auto-discovered relative to CWD
 *
 * Run `ar db:schema:dump` first to create db/schema.ts if you haven't yet.
 *
 * Output:
 *   --out <path>   writes a .ts module to the given file
 *   (absent)       prints the .ts module to stdout
 *
 * The generated module is pure trails ActiveRecord — `class X extends Base`
 * with static-block declarations. Users own the file afterward; there is
 * no round-trip merge. Re-running regenerates.
 */

import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";

import { generateModels } from "@blazetrails/activerecord";

import { parseSchemaForModels } from "../tsc-wrapper/schema-ts-model-parser.js";

interface Args {
  schemaPath?: string;
  outPath?: string;
  ignore: readonly string[];
  only: readonly string[];
  stripPrefix?: string;
  stripSuffix?: string;
  noHeader: boolean;
  format: boolean;
}

function usage(stream: NodeJS.WriteStream): void {
  stream.write(
    "Usage: ar models:dump [--schema <path>] [--out <path>]\n" +
      "                     [--ignore t1,t2] [--only t1,t2]\n" +
      "                     [--strip-prefix <str>] [--strip-suffix <str>]\n" +
      "                     [--no-header] [--format]\n",
  );
}

function parseArgs(argv: readonly string[]): Args | number {
  const out: {
    schemaPath?: string;
    outPath?: string;
    ignore: string[];
    only: string[];
    stripPrefix?: string;
    stripSuffix?: string;
    noHeader: boolean;
    format: boolean;
  } = { ignore: [], only: [], noHeader: false, format: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const readValue = (flag: string): string | number => {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        process.stderr.write(`ar models:dump: ${flag} expects a value.\n`);
        return 1;
      }
      i++;
      return next;
    };
    if (a === "--schema") {
      const v = readValue("--schema");
      if (typeof v === "number") return v;
      out.schemaPath = v;
    } else if (a.startsWith("--schema=")) {
      const v = a.slice("--schema=".length);
      if (!v) {
        process.stderr.write("ar models:dump: --schema expects a value.\n");
        return 1;
      }
      out.schemaPath = v;
    } else if (a === "--out") {
      const v = readValue("--out");
      if (typeof v === "number") return v;
      out.outPath = v;
    } else if (a.startsWith("--out=")) {
      out.outPath = a.slice("--out=".length);
    } else if (a === "--ignore") {
      const v = readValue("--ignore");
      if (typeof v === "number") return v;
      out.ignore.push(...v.split(",").filter(Boolean));
    } else if (a.startsWith("--ignore=")) {
      out.ignore.push(...a.slice("--ignore=".length).split(",").filter(Boolean));
    } else if (a === "--only") {
      const v = readValue("--only");
      if (typeof v === "number") return v;
      out.only.push(...v.split(",").filter(Boolean));
    } else if (a.startsWith("--only=")) {
      out.only.push(...a.slice("--only=".length).split(",").filter(Boolean));
    } else if (a === "--strip-prefix") {
      const v = readValue("--strip-prefix");
      if (typeof v === "number") return v;
      out.stripPrefix = v;
    } else if (a.startsWith("--strip-prefix=")) {
      out.stripPrefix = a.slice("--strip-prefix=".length);
    } else if (a === "--strip-suffix") {
      const v = readValue("--strip-suffix");
      if (typeof v === "number") return v;
      out.stripSuffix = v;
    } else if (a.startsWith("--strip-suffix=")) {
      out.stripSuffix = a.slice("--strip-suffix=".length);
    } else if (a === "--no-header") {
      out.noHeader = true;
    } else if (a === "--format") {
      out.format = true;
    } else if (a === "-h" || a === "--help") {
      usage(process.stdout);
      return 0;
    } else {
      process.stderr.write(`ar models:dump: unknown argument: ${a}\n`);
      return 1;
    }
  }
  if (out.ignore.length > 0 && out.only.length > 0) {
    process.stderr.write("ar models:dump: --only and --ignore are mutually exclusive\n");
    return 1;
  }
  return out;
}

// Metadata tables Rails maintains that users shouldn't be modelling.
const BUILTIN_IGNORE = new Set(["schema_migrations", "ar_internal_metadata"]);

export async function run(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (typeof parsed === "number") return parsed;
  const args = parsed;

  const ignoreSet = new Set([...BUILTIN_IGNORE, ...args.ignore]);
  const onlySet = args.only.length > 0 ? new Set(args.only) : null;
  const keep = (name: string): boolean => {
    if (ignoreSet.has(name)) return false;
    if (onlySet) return onlySet.has(name);
    return true;
  };

  // Resolve the schema source: --schema > auto-discovered db/schema.ts > error.

  const fs = await getFsAsync();
  const path = await getPathAsync();

  let schemaFilePath: string;
  if (args.schemaPath) {
    schemaFilePath = path.resolve(args.schemaPath);
  } else {
    const conventionPath = path.join(fs.cwd(), "db", "schema.ts");
    if (await fs.exists(conventionPath)) {
      schemaFilePath = conventionPath;
    } else {
      process.stderr.write(
        "ar models:dump: no schema file found — pass --schema <path> or run `ar db:schema:dump` to create db/schema.ts.\n",
      );
      return 1;
    }
  }

  let source: string;
  try {
    source = fs.readFileSync(schemaFilePath, "utf8");
  } catch {
    process.stderr.write(`ar models:dump: cannot read schema file: ${schemaFilePath}\n`);
    return 1;
  }
  const sourceHint = schemaFilePath;
  const parsedTables = parseSchemaForModels(source, schemaFilePath);
  if (parsedTables.length === 0) {
    // Distinguish "wrong/empty file" from the post-filter "--only/--ignore
    // matched nothing" case handled by the shared check below.
    process.stderr.write(
      `ar models:dump: no createTable found in ${schemaFilePath} — is it a db/schema.ts?\n`,
    );
    return 1;
  }
  const introspected = parsedTables.filter((t) => keep(t.name));

  if (introspected.length === 0) {
    process.stderr.write("ar models:dump: no tables to generate (check --only/--ignore)\n");
    return 1;
  }

  let output = generateModels(introspected, {
    sourceHint,
    stripPrefix: args.stripPrefix,
    stripSuffix: args.stripSuffix,
    noHeader: args.noHeader,
  });

  if (args.format) {
    output = await maybePrettierFormat(output);
  }

  if (args.outPath) {
    // getFsAsync / getPathAsync auto-register a Node adapter via dynamic
    // import(), which works both in ESM (tsx) and CJS (built bin). The sync
    // getFs()/getPath() variants auto-register via require(), which returns
    // undefined under ESM — so the async pair is the portable choice here.
    const resolved = path.resolve(args.outPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, output);
    process.stdout.write(`ar models:dump: wrote ${resolved}\n`);
  } else {
    process.stdout.write(output);
  }
  return 0;
}

async function maybePrettierFormat(code: string): Promise<string> {
  try {
    // Dynamic import so prettier stays an opt-in runtime dep — users who
    // don't pass --format never need it installed.
    const prettier = (await import("prettier")) as {
      format(src: string, opts: { parser: string }): Promise<string>;
    };
    return await prettier.format(code, { parser: "typescript" });
  } catch {
    process.stderr.write(
      "ar models:dump: warning: --format requested but prettier is not installed; writing unformatted output\n",
    );
    return code;
  }
}
