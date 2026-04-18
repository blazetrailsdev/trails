#!/usr/bin/env node

/**
 * Dump the live database schema as JSON consumable by
 * `trails-tsc --schema <path>`.
 *
 * Usage:
 *   trails-schema-dump [--database-url <url>] [--out <path>] [--ignore table1,table2]
 *
 * The database URL is taken from, in order:
 *   1. --database-url <url>
 *   2. $DATABASE_URL
 *
 * Output:
 *   --out <path>   writes JSON to the given file
 *   (absent)       prints JSON to stdout
 */

import { getFs, getPath } from "@blazetrails/activesupport";

import { Base } from "../base.js";
import { dumpSchemaColumns } from "../schema-columns-dump.js";

interface Args {
  databaseUrl?: string;
  outPath?: string;
  ignore: readonly string[];
}

function parseArgs(argv: readonly string[]): Args {
  const out: { databaseUrl?: string; outPath?: string; ignore: string[] } = { ignore: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const readValue = (flag: string): string => {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        process.stderr.write(`trails-schema-dump: ${flag} expects a value.\n`);
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
    } else if (a === "-h" || a === "--help") {
      process.stdout.write(
        "Usage: trails-schema-dump [--database-url <url>] [--out <path>] [--ignore t1,t2]\n",
      );
      process.exit(0);
    } else {
      process.stderr.write(`trails-schema-dump: unknown argument: ${a}\n`);
      process.exit(1);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = args.databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write(
      "trails-schema-dump: no database URL — pass --database-url or set DATABASE_URL.\n",
    );
    process.exit(1);
  }

  await Base.establishConnection(url);
  const adapter = Base.adapter;
  const dump = await dumpSchemaColumns(adapter, { ignoreTables: args.ignore });
  const json = JSON.stringify(dump, null, 2) + "\n";

  if (args.outPath) {
    const resolved = getPath().resolve(args.outPath);
    getFs().writeFileSync(resolved, json);
    process.stdout.write(`trails-schema-dump: wrote ${resolved}\n`);
  } else {
    process.stdout.write(json);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`trails-schema-dump: ${msg}\n`);
  process.exit(1);
});
