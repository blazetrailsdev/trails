#!/usr/bin/env node

import ts from "typescript";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createTrailsProgram } from "./program.js";
import { createTrailsSolutionBuilder } from "./build.js";
import { remapDiagnostics } from "./remap.js";
import { virtualize } from "../type-virtualization/virtualize.js";
import type { SchemaColumnValue } from "../type-virtualization/synthesize.js";

/**
 * Load a schema-columns JSON file produced by the schema dumper.
 *
 * Format (either shape per column, may mix in one file):
 *   `{ "<table>": { "<column>": "<rails_type>", ... }, ... }` — legacy
 *   `{ "<table>": { "<column>": { "type": "<rails_type>", "null"?: boolean, "arrayElementType"?: string }, ... }, ... }` — rich
 *
 * The rich shape — as emitted by `trails-schema-dump` — drives
 * nullability (`T | null`) and typed array elements (`ElementTsType[]`)
 * in the generated TypeScript declares.
 */
type RichColumnValue = Extract<SchemaColumnValue, object>;

export function loadSchemaColumns(
  args: string[],
): Record<string, Record<string, SchemaColumnValue>> | undefined {
  let schemaPath: string | undefined;
  let schemaProvided = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
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
  let schemaJson: string;
  try {
    schemaJson = fs.readFileSync(resolved, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`trails-tsc: failed to read --schema file: ${msg}\n`);
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(schemaJson);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`trails-tsc: --schema file is not valid JSON: ${msg}\n`);
    process.exit(1);
  }
  return validateSchemaShape(parsed, resolved);
}

// Keys whose assignment on a plain object would pollute the prototype
// chain — rejected up front rather than trusted from JSON input.
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
  // Use null-prototype maps so untrusted keys from the JSON can't reach
  // Object.prototype. Iterate with Object.keys to skip inherited keys on
  // the input (defense-in-depth; JSON.parse never sets them, but the
  // function signature accepts `unknown`).
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

/**
 * A column value can be either a Rails type string (legacy) or a rich
 * object `{ type, null?, arrayElementType? }` emitted by
 * `dumpSchemaColumns`. Reject anything else with a targeted message so
 * users see the actual problem instead of a downstream crash.
 */
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
    // Catch typos / misconfiguration at load time — a non-"array" `type`
    // would silently ignore `arrayElementType` downstream, leaving the
    // user with an unexpectedly-untyped declare.
    if (r.type !== "array") {
      fail(
        `column "${fqColumn}" rich shape: \`arrayElementType\` is only valid when ` +
          `\`type\` is "array" (got type: "${r.type as string}")`,
      );
    }
  }
  const out: RichColumnValue = { type: r.type as string };
  if (r.null !== undefined) out.null = r.null as boolean;
  if (r.arrayElementType !== undefined) {
    out.arrayElementType = r.arrayElementType as string;
  }
  return out;
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
  // Accept both `--pretty true|false` and `--pretty=true|false`; a
  // bare `--pretty` with no following value means `true` (matches tsc).
  const parseValue = (value: string | undefined): boolean | undefined => {
    if (value === undefined) return true;
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  };
  let prettyFromArgs: boolean | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
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
  // --build / -b must be the first arg for tsc compatibility, but be
  // lenient: accept it anywhere so users can pass flags in either
  // order.
  const buildIdx = args.findIndex((a) => a === "--build" || a === "-b");
  if (buildIdx === -1) return;

  // Project paths are positional args AFTER --build. Flags that
  // consume a value must skip that value so we don't treat `false`
  // (from `--pretty false`) or similar as a project path.
  const buildArgs = args.slice(buildIdx + 1);
  const verbose = args.includes("--verbose");
  const clean = args.includes("--clean");
  const flagsWithValues = new Set(["--pretty", "--schema"]);
  const rest: string[] = [];
  for (let i = 0; i < buildArgs.length; i++) {
    const arg = buildArgs[i]!;
    if (arg === "--verbose" || arg === "--clean") continue;
    if (arg.startsWith("--pretty=") || arg.startsWith("--schema=")) continue;
    if (flagsWithValues.has(arg)) {
      if (i + 1 < buildArgs.length && !buildArgs[i + 1]!.startsWith("-")) i++;
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
  const builder = createTrailsSolutionBuilder(rootConfigs, {
    verbose,
    schemaColumnsByTable,
    onDiagnostic: (d) => {
      const out = pretty
        ? ts.formatDiagnosticsWithColorAndContext([d], fh)
        : ts.formatDiagnostics([d], fh);
      process.stderr.write(out);
    },
    onStatus: (d) => {
      // Solution-builder status (informational, not diagnostics).
      const msg = ts.flattenDiagnosticMessageText(d.messageText, ts.sys.newLine);
      process.stdout.write(`${msg}${ts.sys.newLine}`);
    },
  });

  const status = clean ? builder.clean() : builder.build();
  // Preserve TS ExitStatus semantics (Success / DiagnosticsPresent_OutputsSkipped
  // / InvalidProject_OutputsSkipped / ProjectReferenceCycle_OutputsSkipped) so
  // callers scripting `trails-tsc --build` can distinguish them exactly like `tsc -b`.
  process.exit(status);
}

function main(): void {
  const args = process.argv.slice(2);

  handlePrintVirtualized(args);
  handleBuildMode(args);

  // Find -p / --project flag; default to ./tsconfig.json.
  // Error if the flag is present but no value follows (matches tsc).
  let configPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-p" || args[i] === "--project") {
      if (!args[i + 1] || args[i + 1]!.startsWith("-")) {
        process.stderr.write("trails-tsc: Compiler option '--project' expects an argument.\n");
        process.exit(1);
      }
      configPath = args[i + 1];
    }
  }
  // When no -p is given, search upward from cwd for the nearest
  // tsconfig.json — matches tsc's default behavior.
  if (!configPath) {
    configPath =
      ts.findConfigFile(process.cwd(), ts.sys.fileExists) ?? path.resolve("tsconfig.json");
  } else {
    configPath = path.resolve(configPath);
  }

  const schemaColumnsByTable = loadSchemaColumns(args);
  const { program, host, configDiagnostics } = createTrailsProgram(configPath, {
    schemaColumnsByTable,
  });

  const fh = formatHost();

  // Config-level errors (bad tsconfig read / parse) — format and
  // exit before attempting to use the program.
  if (configDiagnostics.length > 0) {
    process.stderr.write(ts.formatDiagnostics(configDiagnostics, fh));
    process.exit(1);
  }

  // getPreEmitDiagnostics includes semantic + syntactic + global +
  // options diagnostics — matches what tsc reports before emit.
  const diagnostics = [...ts.getPreEmitDiagnostics(program)];

  // Check for --noEmit
  const noEmit = args.includes("--noEmit") || program.getCompilerOptions().noEmit;

  if (!noEmit) {
    const emitResult = program.emit();
    diagnostics.push(...emitResult.diagnostics);
  }

  // Remap diagnostic positions from virtualized-source coordinates back
  // to the user's original lines, then sort + deduplicate.
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

// Run main() only when this module is invoked as a binary, not when
// imported (e.g. by tests that exercise `loadSchemaColumns` directly).
// Compare decoded filesystem paths to sidestep URL-encoding pitfalls
// (spaces, Windows drive letters + backslashes) that would trip up a
// naive `import.meta.url === "file://" + path.resolve(entry)` check.
const invokedDirectly = (() => {
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    // Resolve both sides through symlinks so package-manager bin
    // shims (e.g. `node_modules/.bin/trails-tsc` → the real cli.js)
    // still match. Without realpath, a shim invocation would leave
    // `main()` unrun and the CLI becomes a no-op.
    const resolveReal = (p: string): string => {
      try {
        return fs.realpathSync(p);
      } catch {
        return path.resolve(p);
      }
    };
    return resolveReal(fileURLToPath(import.meta.url)) === resolveReal(entry);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  try {
    main();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`trails-tsc: ${msg}\n`);
    process.exit(1);
  }
}
