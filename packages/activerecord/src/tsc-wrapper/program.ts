import ts from "typescript";
import * as path from "node:path";
import { buildCompilerHost, type TrailsCompilerHost } from "./host.js";
import { collectBaseDescendants } from "../type-virtualization/transitive-extends-walker.js";

export interface TrailsProgram {
  program: ts.Program;
  host: TrailsCompilerHost;
  configDiagnostics: readonly ts.Diagnostic[];
}

export interface CreateTrailsProgramOptions {
  schemaColumnsByTable?: Readonly<
    Record<
      string,
      Readonly<Record<string, import("../type-virtualization/synthesize.js").SchemaColumnValue>>
    >
  >;
}

export function createTrailsProgram(
  configPath: string,
  extra: CreateTrailsProgramOptions = {},
): TrailsProgram {
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

  // Pass 1: create program with a plain compiler host (no
  // virtualization / auto-import). We only need the checker here to
  // resolve the full extends chain — doing the text transform twice
  // would be wasted work.
  const host1 = ts.createCompilerHost(parsed.options, true);
  const program1 = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    host: host1,
  });

  // Pass 2: walk the checker to find transitive Base descendants and
  // build the model registry (className → absolutePath) for
  // auto-import resolution.
  const { baseNames, modelRegistry } = collectBaseDescendants(program1);

  // Rebuild with the full allow-list + model registry so transitive
  // classes are virtualized AND missing `import type` lines are
  // auto-injected.
  const host = buildCompilerHost(parsed.options, [...baseNames], modelRegistry, {
    schemaColumnsByTable: extra.schemaColumnsByTable,
  });
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    host,
  });

  return { program, host, configDiagnostics: [] };
}
