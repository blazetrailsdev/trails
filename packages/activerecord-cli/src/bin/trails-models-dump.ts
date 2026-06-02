/**
 * Dump the live database schema as a TypeScript module declaring one
 * `@blazetrails/activerecord` model class per table, with belongsTo /
 * hasMany associations inferred from foreign keys.
 *
 * Usage:
 *   trails-models-dump [--schema <path>] [--database-url <url>] [--out <path>]
 *                      [--ignore t1,t2] [--only t1,t2]
 *                      [--strip-prefix <str>] [--strip-suffix <str>]
 *                      [--no-header] [--format]
 *
 * Source of the schema, in order:
 *   1. --schema <path>     parse a committed db/schema.ts (no DB connection)
 *   2. db/schema.ts        auto-discovered relative to CWD (no DB connection)
 *   3. --database-url <url>
 *   4. $DATABASE_URL
 *
 * The `--schema` path is a pure file read + codegen — it never calls
 * `Base.establishConnection()` and needs no reachable database.
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

import {
  Base,
  introspectTables,
  introspectColumns,
  introspectPrimaryKey,
  introspectForeignKeys,
  generateModels,
  type IntrospectedTable,
} from "@blazetrails/activerecord";

import { parseSchemaForModels } from "../tsc-wrapper/schema-ts-model-parser.js";

interface Args {
  schemaPath?: string;
  databaseUrl?: string;
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
    "Usage: trails-models-dump [--schema <path>] [--database-url <url>] [--out <path>]\n" +
      "                         [--ignore t1,t2] [--only t1,t2]\n" +
      "                         [--strip-prefix <str>] [--strip-suffix <str>]\n" +
      "                         [--no-header] [--format]\n",
  );
}

function parseArgs(argv: readonly string[]): Args | number {
  const out: {
    schemaPath?: string;
    databaseUrl?: string;
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
        process.stderr.write(`trails-models-dump: ${flag} expects a value.\n`);
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
      // An empty value would be falsy and silently misroute to the live-DB
      // branch; reject it the way readValue rejects the space form.
      if (!v) {
        process.stderr.write("trails-models-dump: --schema expects a value.\n");
        return 1;
      }
      out.schemaPath = v;
    } else if (a === "--database-url") {
      const v = readValue("--database-url");
      if (typeof v === "number") return v;
      out.databaseUrl = v;
    } else if (a.startsWith("--database-url=")) {
      out.databaseUrl = a.slice("--database-url=".length);
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
      process.stderr.write(`trails-models-dump: unknown argument: ${a}\n`);
      return 1;
    }
  }
  if (out.ignore.length > 0 && out.only.length > 0) {
    process.stderr.write("trails-models-dump: --only and --ignore are mutually exclusive\n");
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
    if (onlySet) return onlySet.has(name);
    return !ignoreSet.has(name);
  };

  // Resolve the source of truth into IntrospectedTable[] + a sourceHint for
  // the header. Precedence: --schema > auto-discovered db/schema.ts > live DB.
  let introspected: IntrospectedTable[];
  let sourceHint: string;

  if (args.schemaPath) {
    // An explicit --database-url alongside --schema is a conflicting signal;
    // --schema wins (documented precedence), so flag the ignored flag. We do
    // NOT warn on an ambient $DATABASE_URL — that's the common offline case
    // --schema exists to serve, and warning on it would be pure noise.
    if (args.databaseUrl) {
      process.stderr.write("trails-models-dump: --schema given; ignoring --database-url.\n");
    }
    const path = await getPathAsync();
    const fs = await getFsAsync();
    const resolved = path.resolve(args.schemaPath);
    let source: string;
    try {
      source = fs.readFileSync(resolved, "utf8");
    } catch {
      process.stderr.write(`trails-models-dump: cannot read schema file: ${resolved}\n`);
      return 1;
    }
    sourceHint = resolved;
    // No Base.establishConnection() on this path — pure file read + codegen.
    const parsedTables = parseSchemaForModels(source, resolved);
    if (parsedTables.length === 0) {
      // Distinguish "wrong/empty file" from the post-filter "--only/--ignore
      // matched nothing" case handled by the shared check below.
      process.stderr.write(
        `trails-models-dump: no createTable found in ${resolved} — is it a db/schema.ts?\n`,
      );
      return 1;
    }
    introspected = parsedTables.filter((t) => keep(t.name));
  } else {
    // Convention default: auto-discover db/schema.ts relative to CWD before
    // reaching for a live DB connection.
    const fs = await getFsAsync();
    const path = await getPathAsync();
    const conventionSchema = path.join(fs.cwd(), "db", "schema.ts");

    if (await fs.exists(conventionSchema)) {
      let source: string;
      try {
        source = fs.readFileSync(conventionSchema, "utf8");
      } catch {
        process.stderr.write(`trails-models-dump: cannot read schema file: ${conventionSchema}\n`);
        return 1;
      }
      sourceHint = conventionSchema;
      const parsedTables = parseSchemaForModels(source, conventionSchema);
      if (parsedTables.length === 0) {
        process.stderr.write(
          `trails-models-dump: no createTable found in ${conventionSchema} — is it a db/schema.ts?\n`,
        );
        return 1;
      }
      introspected = parsedTables.filter((t) => keep(t.name));
    } else {
      const url = args.databaseUrl ?? process.env.DATABASE_URL;
      if (!url) {
        process.stderr.write(
          "trails-models-dump: no database URL — pass --database-url or set DATABASE_URL.\n",
        );
        return 1;
      }
      process.stderr.write(
        "trails-models-dump: warning: generating from a live DB connection; consider committing db/schema.ts and using --schema instead.\n",
      );

      await Base.establishConnection(url);
      const adapter = Base.connection;

      const allTables = await introspectTables(adapter);
      const tableNames = allTables.filter(keep);
      sourceHint = url;

      // Assemble IntrospectedTable[] — run the four introspection helpers per
      // table in parallel. generateModels requires primaryKey / foreignKeys /
      // columns; we pass columns through for polymorphic + STI detection.
      introspected = await Promise.all(
        tableNames.map(async (name): Promise<IntrospectedTable> => {
          const [pk, cols, fks] = await Promise.all([
            introspectPrimaryKey(adapter, name),
            introspectColumns(adapter, name),
            introspectForeignKeys(adapter, name),
          ]);
          // introspectPrimaryKey normalises no-PK to []; treat [] as null for
          // generateModels's view-skip logic so the header tally picks it up.
          const primaryKey = pk.length === 0 ? null : pk.length === 1 ? pk[0]! : pk;
          return {
            name,
            primaryKey,
            foreignKeys: fks,
            columns: cols.map((c) => ({
              name: c.name,
              type: c.sqlType ?? c.type ?? "",
            })),
          };
        }),
      );
    }
  }

  if (introspected.length === 0) {
    process.stderr.write("trails-models-dump: no tables to generate (check --only/--ignore)\n");
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
    const path = await getPathAsync();
    const fs = await getFsAsync();
    const resolved = path.resolve(args.outPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, output);
    process.stdout.write(`trails-models-dump: wrote ${resolved}\n`);
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
      "trails-models-dump: warning: --format requested but prettier is not installed; writing unformatted output\n",
    );
    return code;
  }
}
