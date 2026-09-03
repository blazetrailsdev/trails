import ts from "typescript";
import * as path from "node:path";
import { buildCompilerHost, type TrailsCompilerHost } from "./host.js";
import type { TscPlugin } from "./plugin.js";
import { remapDiagnostics } from "./remap.js";

export interface TrailsSolutionBuilder {
  build(): ts.ExitStatus;
  clean(): ts.ExitStatus;
}

export type PluginFactory = (
  plainProgram: ts.Program,
  options: ts.CompilerOptions,
) => readonly TscPlugin[];

export interface TrailsBuildOptions {
  verbose?: boolean;
  onDiagnostic?: (d: ts.Diagnostic) => void;
  onStatus?: (d: ts.Diagnostic) => void;
  pluginFactory?: PluginFactory;
}

export function createTrailsSolutionBuilder(
  rootConfigs: readonly string[],
  buildOpts: TrailsBuildOptions = {},
): TrailsSolutionBuilder {
  const hostsByProject = new Map<string, TrailsCompilerHost>();

  const createProgram: ts.CreateProgram<ts.EmitAndSemanticDiagnosticsBuilderProgram> = (
    rootNames,
    options,
    _defaultHost,
    oldProgram,
    configFileParsingDiagnostics,
    projectReferences,
  ) => {
    if (!rootNames || !options) {
      if (oldProgram) return oldProgram;
      throw new Error(
        "createTrailsSolutionBuilder received unresolved rootNames or compiler options",
      );
    }

    const pass1Host = ts.createCompilerHost(options, true);
    const pass1Program = ts.createProgram({
      rootNames: [...rootNames],
      options,
      host: pass1Host,
      projectReferences: projectReferences ? [...projectReferences] : undefined,
    });
    const plugins = buildOpts.pluginFactory?.(pass1Program, options) ?? [];

    const host = buildCompilerHost(options, { plugins });
    const configFilePath = options.configFilePath;
    if (typeof configFilePath === "string") {
      hostsByProject.set(path.resolve(configFilePath), host);
    }
    return ts.createEmitAndSemanticDiagnosticsBuilderProgram(
      rootNames,
      options,
      host,
      oldProgram,
      configFileParsingDiagnostics,
      projectReferences,
    );
  };

  const fileOwner = new Map<string, TrailsCompilerHost | null>();
  const ownerOf = (fileName: string): TrailsCompilerHost | null => {
    const cached = fileOwner.get(fileName);
    if (cached !== undefined) return cached;
    for (const host of hostsByProject.values()) {
      if (host.getDeltasForFile(fileName) || host.getOriginalText(fileName) != null) {
        fileOwner.set(fileName, host);
        return host;
      }
    }
    fileOwner.set(fileName, null);
    return null;
  };
  const compositeRemapHost = {
    getDeltasForFile: (fileName: string) => ownerOf(fileName)?.getDeltasForFile(fileName),
    getOriginalText: (fileName: string) => ownerOf(fileName)?.getOriginalText(fileName),
  } as unknown as TrailsCompilerHost;

  const originalSfCache = new Map<string, ts.SourceFile>();

  const reportDiagnostic: ts.DiagnosticReporter = (d) => {
    if (!buildOpts.onDiagnostic) return;
    const remapped = remapDiagnostics([d], compositeRemapHost, originalSfCache)[0];
    buildOpts.onDiagnostic(remapped);
  };
  const reportStatus: ts.DiagnosticReporter = (d) => buildOpts.onStatus?.(d);

  const solutionHost = ts.createSolutionBuilderHost(
    ts.sys,
    createProgram,
    reportDiagnostic,
    reportStatus,
  );

  const builder = ts.createSolutionBuilder(solutionHost, [...rootConfigs], {
    verbose: buildOpts.verbose ?? false,
  });

  return {
    build: () => builder.build(),
    clean: () => builder.clean(),
  };
}
