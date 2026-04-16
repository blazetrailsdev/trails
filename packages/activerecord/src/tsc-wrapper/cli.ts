#!/usr/bin/env node

import ts from "typescript";
import * as path from "node:path";
import { createTrailsProgram } from "./program.js";

function main(): void {
  const args = process.argv.slice(2);

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

  const { program, configDiagnostics } = createTrailsProgram(configPath);

  const formatHost: ts.FormatDiagnosticsHost = {
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: (f) => (ts.sys.useCaseSensitiveFileNames ? f : f.toLowerCase()),
    getNewLine: () => ts.sys.newLine,
  };

  // Config-level errors (bad tsconfig read / parse) — format and
  // exit before attempting to use the program.
  if (configDiagnostics.length > 0) {
    process.stderr.write(ts.formatDiagnostics(configDiagnostics, formatHost));
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

  // Sort + deduplicate to match tsc output ordering and avoid dupes.
  const sorted = ts.sortAndDeduplicateDiagnostics(diagnostics);

  if (sorted.length > 0) {
    // Mirror tsc's --pretty default: on when stdout is a TTY,
    // off otherwise. Explicit --pretty true/false overrides.
    const prettyIndex = args.indexOf("--pretty");
    const prettyFromArgs =
      prettyIndex === -1 ? undefined : args[prettyIndex + 1] === "false" ? false : true;
    const pretty =
      prettyFromArgs ?? program.getCompilerOptions().pretty ?? ts.sys.writeOutputIsTTY?.() ?? false;
    const output = pretty
      ? ts.formatDiagnosticsWithColorAndContext(sorted, formatHost)
      : ts.formatDiagnostics(sorted, formatHost);

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
