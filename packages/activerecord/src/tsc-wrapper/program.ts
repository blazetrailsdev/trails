import ts from "typescript";
import * as path from "node:path";
import { buildCompilerHost, type TrailsCompilerHost } from "./host.js";
import { collectBaseDescendants } from "../type-virtualization/transitive-extends-walker.js";

export interface TrailsProgram {
  program: ts.Program;
  host: TrailsCompilerHost;
  configDiagnostics: readonly ts.Diagnostic[];
}

export function createTrailsProgram(configPath: string): TrailsProgram {
  // Resolve config path the same way tsc does: accept either a file or
  // a directory (appends /tsconfig.json). Unlike ts.findConfigFile, we
  // don't search upward — tsc -p <dir> expects <dir>/tsconfig.json and
  // errors if it doesn't exist.
  const resolvedConfig = ts.sys.directoryExists(configPath)
    ? path.join(configPath, "tsconfig.json")
    : configPath;

  const configFile = ts.readConfigFile(resolvedConfig, ts.sys.readFile);
  if (configFile.error) {
    // Return early with the diagnostic — let the CLI format it
    // consistently with the same FormatDiagnosticsHost used for
    // program diagnostics. No program to construct.
    return {
      program: undefined!,
      host: undefined!,
      configDiagnostics: [configFile.error],
    };
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(resolvedConfig),
    undefined,
    resolvedConfig,
  );

  if (parsed.errors.length > 0) {
    return {
      program: undefined!,
      host: undefined!,
      configDiagnostics: parsed.errors,
    };
  }

  // Pass 1: create program with default virtualization (literal
  // `extends Base` only). This gives us a checker to resolve the
  // full extends chain.
  const host1 = buildCompilerHost(parsed.options);
  const program1 = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    host: host1,
  });

  // Pass 2: walk the checker to find transitive Base descendants
  // (e.g. `class Admin extends User extends Base`). If any new names
  // are found, rebuild with the expanded allow-list so those classes
  // get virtualized too.
  const baseNames = collectBaseDescendants(program1);
  const defaultNames = new Set(["Base"]);
  const hasNewNames = [...baseNames].some((n) => !defaultNames.has(n));

  if (!hasNewNames) {
    return { program: program1, host: host1, configDiagnostics: [] };
  }

  const host = buildCompilerHost(parsed.options, [...baseNames]);
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    host,
  });

  return { program, host, configDiagnostics: [] };
}
