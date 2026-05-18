import ts from "typescript";
import * as path from "node:path";
import { buildCompilerHost, type TrailsCompilerHost } from "./host.js";
import type { TscPlugin } from "./plugin.js";

export interface TrailsProgram {
  program: ts.Program;
  host: TrailsCompilerHost;
  configDiagnostics: readonly ts.Diagnostic[];
}

export interface CreateTrailsProgramOptions {
  /**
   * Plugins to register with the compiler host. Some plugins (notably
   * AR's `ar-models`) need a TypeScript checker to resolve symbol
   * references before they can virtualize, so callers typically run
   * `createPlainProgram` first, build the plugin, then call
   * `createTrailsProgram` with the plugin attached.
   */
  plugins?: readonly TscPlugin[];
}

/**
 * Parse `tsconfig.json` and create a `ts.Program` backed by a
 * plugin-driven compiler host. Returns `configDiagnostics` instead of
 * throwing so callers can format them with the same formatter they
 * use for program diagnostics.
 */
export function createTrailsProgram(
  configPath: string,
  extra: CreateTrailsProgramOptions = {},
): TrailsProgram {
  const parsed = readAndParseConfig(configPath);
  if ("configDiagnostics" in parsed) return parsed;
  const host = buildCompilerHost(parsed.options, { plugins: extra.plugins });
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    host,
  });
  return { program, host, configDiagnostics: [] };
}

/**
 * Create a plain (non-virtualizing) `ts.Program` for the given
 * tsconfig. Useful as a preliminary pass when a plugin needs to walk
 * the checker before it can construct itself.
 */
export function createPlainProgram(configPath: string): TrailsProgram {
  const parsed = readAndParseConfig(configPath);
  if ("configDiagnostics" in parsed) return parsed;
  const host = ts.createCompilerHost(parsed.options, true) as TrailsCompilerHost;
  host.getDeltasForFile = () => undefined;
  host.getOriginalText = () => undefined;
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    host,
  });
  return { program, host, configDiagnostics: [] };
}

type ParsedConfig = { options: ts.CompilerOptions; fileNames: string[] } | TrailsProgram;

function readAndParseConfig(configPath: string): ParsedConfig {
  // Resolve config path the same way tsc does: accept either a file
  // or a directory (appends /tsconfig.json). Unlike `ts.findConfigFile`
  // we don't search upward — `tsc -p <dir>` expects `<dir>/tsconfig.json`.
  const resolved = ts.sys.directoryExists(configPath)
    ? path.join(configPath, "tsconfig.json")
    : configPath;
  const configFile = ts.readConfigFile(resolved, ts.sys.readFile);
  if (configFile.error) {
    return { program: undefined!, host: undefined!, configDiagnostics: [configFile.error] };
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(resolved),
    undefined,
    resolved,
  );
  if (parsed.errors.length > 0) {
    return { program: undefined!, host: undefined!, configDiagnostics: parsed.errors };
  }
  return { options: parsed.options, fileNames: parsed.fileNames };
}
