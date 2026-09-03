#!/usr/bin/env node

import ts from "typescript";
import * as path from "node:path";
import * as fs from "node:fs";
import { remapDiagnostics } from "@blazetrails/trails-tsc";
import { virtualize } from "@blazetrails/activerecord/type-virtualization/virtualize.js";
import { createArTrailsProgram, createArSolutionBuilder } from "./ar-program.js";
import type { SchemaColumnValue } from "@blazetrails/activerecord/type-virtualization/synthesize.js";
import { parseSchemaTs } from "./schema-ts-parser.js";

type RichColumnValue = Extract<SchemaColumnValue, object>;

export function loadSchemaColumns(
  args: string[],
): Record<string, Record<string, SchemaColumnValue>> | undefined {
  let schemaPath: string | undefined;
  let schemaProvided = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--schema") {
      schemaProvided = true;
      const nextArg = args[i + 1];
      if (!nextArg || nextArg.startsWith("-")) {
        process.stderr.write("trails-tsc: --schema expects a file path.\n");
        process.exit(1);
      }
      schemaPath = nextArg;
      break;
    }
    if (a.startsWith("--schema=")) {
      schemaProvided = true;
      const value = a.slice("--schema=".length);
      if (!value) {
        process.stderr.write("trails-tsc: --schema expects a file path.\n");
        process.exit(1);
      }
      schemaPath = value;
      break;
    }
  }
  if (!schemaProvided || !schemaPath) return undefined;
  const resolved = path.resolve(schemaPath);
  if (!fs.existsSync(resolved)) {
    process.stderr.write(`trails-tsc: --schema file not found: ${resolved}\n`);
    process.exit(1);
  }
  let source: string;
  try {
    source = fs.readFileSync(resolved, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`trails-tsc: failed to read --schema file: ${msg}\n`);
    process.exit(1);
  }
  const ext = path.extname(resolved).toLowerCase();
  if (ext === ".ts" || ext === ".js") {
    const result = parseSchemaTs(source, resolved);
    if (Object.keys(result).length === 0) {
      process.stderr.write(
        `trails-tsc: --schema ${resolved}: no createTable() calls found; ` +
          `proceeding without schema-driven declares.\n`,
      );
    }
    return result;
  }
  if (ext !== ".json" && ext !== "") {
    process.stderr.write(
      `trails-tsc: --schema: extension "${ext}" is not supported. ` +
        `Use db/schema.ts (TypeScript) or a legacy .json column-dump.\n`,
    );
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`trails-tsc: --schema file is not valid JSON: ${msg}\n`);
    process.exit(1);
  }
  return validateSchemaShape(parsed, resolved);
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function validateSchemaShape(
  value: unknown,
  path: string,
): Record<string, Record<string, SchemaColumnValue>> {
  const fail = (reason: string): never => {
    process.stderr.write(`trails-tsc: --schema file ${path} is malformed: ${reason}\n`);
    process.exit(1);
  };
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("expected a top-level object of { [table]: { [column]: railsType | richValue } }");
  }
  const out: Record<string, Record<string, SchemaColumnValue>> = Object.create(null);
  for (const table of Object.keys(value as object)) {
    if (UNSAFE_KEYS.has(table)) fail(`table name "${table}" is not allowed`);
    const cols = (value as Record<string, unknown>)[table];
    if (cols === null || typeof cols !== "object" || Array.isArray(cols)) {
      fail(`table "${table}" must map to an object of column definitions`);
    }
    const colMap: Record<string, SchemaColumnValue> = Object.create(null);
    for (const col of Object.keys(cols as object)) {
      if (UNSAFE_KEYS.has(col)) fail(`column name "${table}.${col}" is not allowed`);
      const raw = (cols as Record<string, unknown>)[col];
      colMap[col] = validateColumnValue(raw, `${table}.${col}`, fail);
    }
    out[table] = colMap;
  }
  return out;
}

function validateColumnValue(
  raw: unknown,
  fqColumn: string,
  fail: (reason: string) => never,
): SchemaColumnValue {
  if (typeof raw === "string") return raw;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    const got = raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw;
    fail(
      `column "${fqColumn}" must be a Rails type string or an object ` +
        `with at least { type: string } (got ${got})`,
    );
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.type !== "string") {
    fail(`column "${fqColumn}" rich shape requires { type: string } (got ${typeof r.type})`);
  }
  if (r.null !== undefined && typeof r.null !== "boolean") {
    fail(`column "${fqColumn}" rich shape: \`null\` must be a boolean when present`);
  }
  if (r.arrayElementType !== undefined) {
    if (typeof r.arrayElementType !== "string") {
      fail(`column "${fqColumn}" rich shape: \`arrayElementType\` must be a string when present`);
    }
    if (r.type !== "array") {
      fail(
        `column "${fqColumn}" rich shape: \`arrayElementType\` is only valid when ` +
          `\`type\` is "array" (got type: "${r.type}")`,
      );
    }
  }
  const out: RichColumnValue = { type: r.type };
  if (r.null !== undefined) out.null = r.null;
  if (r.arrayElementType !== undefined) {
    out.arrayElementType = r.arrayElementType;
  }
  return out;
}

export function handleHelp(args: string[]): void {
  if (!args.includes("--help") && !args.includes("-h")) return;
  process.stdout.write(
    "Usage: trails-tsc [tsc-options] [--schema <path>]\n\n" +
      "  --schema <path>  Schema source: db/schema.ts (TypeScript) or a legacy .json\n" +
      "                   column-dump. Drives attribute virtualization.\n\n" +
      "  All other options are passed through to tsc. Run tsc --help for the full list.\n",
  );
  process.exit(0);
}

function handlePrintVirtualized(args: string[]): void {
  const idx = args.indexOf("--print-virtualized");
  if (idx === -1) return;
  const filePath = args[idx + 1];
  if (!filePath) {
    process.stderr.write("trails-tsc: --print-virtualized expects a file path.\n");
    process.exit(1);
  }
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    process.stderr.write(`trails-tsc: File not found: ${resolved}\n`);
    process.exit(1);
  }
  const text = fs.readFileSync(resolved, "utf8");
  const schemaColumnsByTable = loadSchemaColumns(args);
  const { text: virtualized } = virtualize(text, resolved, { schemaColumnsByTable });
  process.stdout.write(virtualized);
  process.exit(0);
}

function parsePretty(args: string[], options: ts.CompilerOptions): boolean {
  const parseValue = (value: string | undefined): boolean | undefined => {
    if (value === undefined) return true;
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  };
  let prettyFromArgs: boolean | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--pretty") {
      prettyFromArgs = parseValue(args[i + 1]) ?? true;
      break;
    }
    if (arg.startsWith("--pretty=")) {
      const parsed = parseValue(arg.slice("--pretty=".length));
      if (parsed !== undefined) {
        prettyFromArgs = parsed;
        break;
      }
    }
  }
  const prettyFromOpts = typeof options.pretty === "boolean" ? options.pretty : undefined;
  return prettyFromArgs ?? prettyFromOpts ?? ts.sys.writeOutputIsTTY?.() ?? false;
}

function formatHost(): ts.FormatDiagnosticsHost {
  return {
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: (f) => (ts.sys.useCaseSensitiveFileNames ? f : f.toLowerCase()),
    getNewLine: () => ts.sys.newLine,
  };
}

function handleBuildMode(args: string[]): void {
  const buildIdx = args.findIndex((a) => a === "--build" || a === "-b");
  if (buildIdx === -1) return;

  const buildArgs = args.slice(buildIdx + 1);
  const verbose = args.includes("--verbose");
  const clean = args.includes("--clean");
  const flagsWithValues = new Set(["--pretty", "--schema"]);
  const rest: string[] = [];
  for (let i = 0; i < buildArgs.length; i++) {
    const arg = buildArgs[i];
    if (arg === "--verbose" || arg === "--clean") continue;
    if (arg.startsWith("--pretty=") || arg.startsWith("--schema=")) continue;
    if (flagsWithValues.has(arg)) {
      if (i + 1 < buildArgs.length && !buildArgs[i + 1].startsWith("-")) i++;
      continue;
    }
    if (arg.startsWith("-")) continue;
    rest.push(arg);
  }
  const rootConfigs =
    rest.length > 0
      ? rest.map((p) => path.resolve(p))
      : [ts.findConfigFile(process.cwd(), ts.sys.fileExists) ?? path.resolve("tsconfig.json")];

  const fh = formatHost();
  const pretty = parsePretty(args, {});
  const schemaColumnsByTable = loadSchemaColumns(args);
  const builder = createArSolutionBuilder(rootConfigs, {
    verbose,
    schemaColumnsByTable,
    onDiagnostic: (d) => {
      const out = pretty
        ? ts.formatDiagnosticsWithColorAndContext([d], fh)
        : ts.formatDiagnostics([d], fh);
      process.stderr.write(out);
    },
    onStatus: (d) => {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, ts.sys.newLine);
      process.stdout.write(`${msg}${ts.sys.newLine}`);
    },
  });

  const status = clean ? builder.clean() : builder.build();
  process.exit(status);
}

export function main(): void {
  const args = process.argv.slice(2);

  handleHelp(args);
  handlePrintVirtualized(args);
  handleBuildMode(args);

  let configPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-p" || args[i] === "--project") {
      if (!args[i + 1] || args[i + 1].startsWith("-")) {
        process.stderr.write("trails-tsc: Compiler option '--project' expects an argument.\n");
        process.exit(1);
      }
      configPath = args[i + 1];
    }
  }
  if (!configPath) {
    configPath =
      ts.findConfigFile(process.cwd(), ts.sys.fileExists) ?? path.resolve("tsconfig.json");
  } else {
    configPath = path.resolve(configPath);
  }

  const schemaColumnsByTable = loadSchemaColumns(args);
  const { program, host, configDiagnostics } = createArTrailsProgram(configPath, {
    schemaColumnsByTable,
  });

  const fh = formatHost();

  if (configDiagnostics.length > 0) {
    process.stderr.write(ts.formatDiagnostics(configDiagnostics, fh));
    process.exit(1);
  }

  const diagnostics = [...ts.getPreEmitDiagnostics(program)];

  const noEmit = args.includes("--noEmit") || program.getCompilerOptions().noEmit;

  if (!noEmit) {
    const emitResult = program.emit();
    diagnostics.push(...emitResult.diagnostics);
  }

  const remapped = remapDiagnostics(diagnostics, host);
  const sorted = ts.sortAndDeduplicateDiagnostics(remapped);

  if (sorted.length > 0) {
    const pretty = parsePretty(args, program.getCompilerOptions());
    const output = pretty
      ? ts.formatDiagnosticsWithColorAndContext(sorted, fh)
      : ts.formatDiagnostics(sorted, fh);
    process.stderr.write(output);
    process.exit(1);
  }

  process.exit(0);
}
