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
  plugins?: readonly TscPlugin[];
}

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
