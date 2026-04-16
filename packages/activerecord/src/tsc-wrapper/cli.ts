#!/usr/bin/env node

import ts from "typescript";
import * as path from "node:path";
import * as fs from "node:fs";
import { createTrailsProgram } from "./program.js";
import { createTrailsSolutionBuilder } from "./build.js";
import { remapDiagnostics } from "./remap.js";
import { virtualize } from "../type-virtualization/virtualize.js";

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
  const { text: virtualized } = virtualize(text, resolved);
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
  const flagsWithValues = new Set(["--pretty"]);
  const rest: string[] = [];
  for (let i = 0; i < buildArgs.length; i++) {
    const arg = buildArgs[i]!;
    if (arg === "--verbose" || arg === "--clean") continue;
    if (arg.startsWith("--pretty=")) continue;
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
  const builder = createTrailsSolutionBuilder(rootConfigs, {
    verbose,
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

  const { program, host, configDiagnostics } = createTrailsProgram(configPath);

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

try {
  main();
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`trails-tsc: ${msg}\n`);
  process.exit(1);
}
