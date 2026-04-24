#!/usr/bin/env node

/**
 * Dump the live database schema as a TypeScript module declaring one
 * `@blazetrails/activerecord` model class per table, with belongsTo /
 * hasMany associations inferred from foreign keys.
 *
 * Usage:
 *   trails-models-dump [--database-url <url>] [--out <path>]
 *                      [--ignore t1,t2] [--only t1,t2]
 *                      [--strip-prefix <str>] [--strip-suffix <str>]
 *                      [--no-header] [--format]
 *
 * The database URL is taken from, in order:
 *   1. --database-url <url>
 *   2. $DATABASE_URL
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

import { Base } from "../base.js";
import {
  introspectTables,
  introspectColumns,
  introspectPrimaryKey,
  introspectForeignKeys,
} from "../schema-introspection.js";
import { generateModels, type IntrospectedTable } from "../model-codegen.js";

interface Args {
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
    "Usage: trails-models-dump [--database-url <url>] [--out <path>]\n" +
      "                         [--ignore t1,t2] [--only t1,t2]\n" +
      "                         [--strip-prefix <str>] [--strip-suffix <str>]\n" +
      "                         [--no-header] [--format]\n",
  );
}

function parseArgs(argv: readonly string[]): Args {
  const out: {
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
    const readValue = (flag: string): string => {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        process.stderr.write(`trails-models-dump: ${flag} expects a value.\n`);
        process.exit(1);
      }
      i++;
      return next;
    };
    if (a === "--database-url") out.databaseUrl = readValue("--database-url");
    else if (a.startsWith("--database-url=")) out.databaseUrl = a.slice("--database-url=".length);
    else if (a === "--out") out.outPath = readValue("--out");
    else if (a.startsWith("--out=")) out.outPath = a.slice("--out=".length);
    else if (a === "--ignore") {
      out.ignore.push(...readValue("--ignore").split(",").filter(Boolean));
    } else if (a.startsWith("--ignore=")) {
      out.ignore.push(...a.slice("--ignore=".length).split(",").filter(Boolean));
    } else if (a === "--only") {
      out.only.push(...readValue("--only").split(",").filter(Boolean));
    } else if (a.startsWith("--only=")) {
      out.only.push(...a.slice("--only=".length).split(",").filter(Boolean));
    } else if (a === "--strip-prefix") out.stripPrefix = readValue("--strip-prefix");
    else if (a.startsWith("--strip-prefix=")) out.stripPrefix = a.slice("--strip-prefix=".length);
    else if (a === "--strip-suffix") out.stripSuffix = readValue("--strip-suffix");
    else if (a.startsWith("--strip-suffix=")) out.stripSuffix = a.slice("--strip-suffix=".length);
    else if (a === "--no-header") out.noHeader = true;
    else if (a === "--format") out.format = true;
    else if (a === "-h" || a === "--help") {
      usage(process.stdout);
      process.exit(0);
    } else {
      process.stderr.write(`trails-models-dump: unknown argument: ${a}\n`);
      process.exit(1);
    }
  }
  if (out.ignore.length > 0 && out.only.length > 0) {
    process.stderr.write("trails-models-dump: --only and --ignore are mutually exclusive\n");
    process.exit(1);
  }
  return out;
}

// Built-ins match trails-schema-dump — metadata tables Rails maintains
// that users shouldn't be modelling.
const BUILTIN_IGNORE = new Set(["schema_migrations", "ar_internal_metadata"]);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = args.databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write(
      "trails-models-dump: no database URL — pass --database-url or set DATABASE_URL.\n",
    );
    process.exit(1);
  }

  await Base.establishConnection(url);
  const adapter = Base.adapter;

  const allTables = await introspectTables(adapter);
  const ignoreSet = new Set([...BUILTIN_IGNORE, ...args.ignore]);
  const onlySet = args.only.length > 0 ? new Set(args.only) : null;
  const keep = (name: string): boolean => {
    if (onlySet) return onlySet.has(name);
    return !ignoreSet.has(name);
  };
  const tableNames = allTables.filter(keep);

  if (tableNames.length === 0) {
    process.stderr.write("trails-models-dump: no tables to generate (check --only/--ignore)\n");
    process.exit(1);
  }

  // Assemble IntrospectedTable[] — run the four introspection helpers per
  // table in parallel. generateModels requires primaryKey / foreignKeys /
  // columns; we pass columns through for polymorphic + STI detection.
  const introspected: IntrospectedTable[] = await Promise.all(
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

  let output = generateModels(introspected, {
    sourceHint: url,
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

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`trails-models-dump: ${msg}\n`);
  process.exit(1);
});
