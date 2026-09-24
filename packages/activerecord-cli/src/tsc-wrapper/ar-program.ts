import {
  createTrailsSolutionBuilder,
  remapLine,
  type LineDelta,
  type TrailsBuildOptions,
} from "@blazetrails/trails-tsc";
import { createFileSystemLayer } from "typescript/unstable/fs";
import { computeLineStarts } from "typescript/unstable/ast/scanner";
import type { Diagnostic, DiagnosticCategory, Program } from "typescript/unstable/sync";
import { tsApi } from "@blazetrails/activerecord/type-virtualization/ts-api.js";
import { collectBaseDescendants } from "@blazetrails/activerecord/type-virtualization/transitive-extends-walker.js";
import { createArModelsPlugin, type ArModelsPluginOptions } from "./ar-models-plugin.js";

export interface CreateArTrailsProgramOptions {
  schemaColumnsByTable?: ArModelsPluginOptions["schemaColumnsByTable"];
}

export interface ArRemapHost {
  getDeltasForFile(fileName: string): readonly LineDelta[] | undefined;
  getOriginalText(fileName: string): string | undefined;
}

export interface ArTrailsProgram {
  program: Program;
  host: ArRemapHost;
  configDiagnostics: readonly Diagnostic[];
}

export function createArTrailsProgram(
  configPath: string,
  opts: CreateArTrailsProgramOptions = {},
): ArTrailsProgram {
  const api = tsApi();
  const configFile = api.readConfigFile(configPath);
  const configDiagnostics = configFile.error
    ? [configFile.error]
    : api.parseJsonConfigFileContent(configFile.config, { configFileName: configPath }).errors;
  if (configDiagnostics.length > 0) {
    return { program: undefined!, host: undefined!, configDiagnostics };
  }
  const { baseNames, modelRegistry } = collectBaseDescendants(configPath);
  const plugin = createArModelsPlugin({
    baseNames: [...baseNames],
    modelRegistry,
    schemaColumnsByTable: opts.schemaColumnsByTable,
  });

  const deltaMap = new Map<string, readonly LineDelta[]>();
  const originalTextMap = new Map<string, string>();
  const layer: [string, string][] = [];
  const plain = api.createSnapshot({ openProjects: [configPath] });
  try {
    const { program } = plain.getConfiguredProject(configPath)!;
    for (const fileName of program.getSourceFileNames()) {
      if (!plugin.extensions.some((ext) => fileName.endsWith(ext))) continue;
      const sf = program.getSourceFile(fileName);
      if (!sf || sf.isDeclarationFile) continue;
      const result = plugin.virtualize(fileName, sf.text);
      if (!result) continue;
      layer.push([fileName, result.ts]);
      originalTextMap.set(fileName, sf.text);
      if (result.deltas && result.deltas.length > 0) deltaMap.set(fileName, result.deltas);
    }
  } finally {
    plain.dispose();
  }

  const snapshot = api.createSnapshot({
    openProjects: [configPath],
    fileSystem: createFileSystemLayer(layer),
  });
  return {
    program: snapshot.getConfiguredProject(configPath)!.program,
    host: {
      getDeltasForFile: (fileName) => deltaMap.get(fileName),
      getOriginalText: (fileName) => originalTextMap.get(fileName),
    },
    configDiagnostics: [],
  };
}

export function getPreEmitDiagnostics(program: Program): Diagnostic[] {
  const diagnostics = [
    ...program.getConfigFileParsingDiagnostics(),
    ...program.getProgramDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ];
  const options = program.getCompilerOptions();
  if (options.declaration || options.composite) {
    diagnostics.push(...program.getDeclarationDiagnostics());
  }
  return sortAndDeduplicateDiagnostics(diagnostics);
}

function compareStringsCaseSensitive(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return -1;
  if (b === undefined) return 1;
  return a < b ? -1 : 1;
}

function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    compareStringsCaseSensitive(a.fileName, b.fileName) ||
    a.pos - b.pos ||
    a.end - b.end ||
    a.code - b.code ||
    compareStringsCaseSensitive(a.text, b.text)
  );
}

export function sortAndDeduplicateDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const sorted = [...diagnostics].sort(compareDiagnostics);
  return sorted.filter((d, i) => i === 0 || compareDiagnostics(sorted[i - 1], d) !== 0);
}

export function remapDiagnostics(
  diagnostics: readonly Diagnostic[],
  host: ArRemapHost,
): Diagnostic[] {
  const lineStartsCache = new Map<string, number[]>();
  return diagnostics.map((d) => remapOneDiagnostic(d, host, lineStartsCache));
}

function remapOneDiagnostic(
  d: Diagnostic,
  host: ArRemapHost,
  lineStartsCache: Map<string, number[]>,
): Diagnostic {
  const relatedInformation = d.relatedInformation?.map((ri) =>
    remapOneDiagnostic(ri, host, lineStartsCache),
  );
  const unmoved = relatedInformation ? { ...d, relatedInformation } : d;
  if (!d.fileName || !d.startPosition) return unmoved;

  const deltas = host.getDeltasForFile(d.fileName);
  if (!deltas || deltas.length === 0) return unmoved;

  const virtualLine = d.startPosition.line;
  const originalLine = remapLine(virtualLine, deltas);
  if (originalLine === null || originalLine === virtualLine) return unmoved;

  const originalText = host.getOriginalText(d.fileName);
  if (originalText == null) return unmoved;
  let lineStarts = lineStartsCache.get(d.fileName);
  if (!lineStarts) {
    lineStarts = computeLineStarts(originalText);
    lineStartsCache.set(d.fileName, lineStarts);
  }

  const pos = lineStarts[originalLine] + d.startPosition.character;
  const endPosition = d.endPosition && {
    line: remapLine(d.endPosition.line, deltas) ?? originalLine,
    character: d.endPosition.character,
  };
  return {
    ...unmoved,
    pos,
    end: endPosition ? lineStarts[endPosition.line] + endPosition.character : pos + (d.end - d.pos),
    startPosition: { line: originalLine, character: d.startPosition.character },
    endPosition,
    sourceLines: d.sourceLines?.flatMap(({ line: virtual }) => {
      const line = remapLine(virtual, deltas);
      if (line === null) return [];
      return [{ line, text: originalText.slice(lineStarts[line], lineStarts[line + 1]) }];
    }),
  };
}

export enum ExitStatus {
  Success = 0,
  DiagnosticsPresent_OutputsSkipped = 1,
  DiagnosticsPresent_OutputsGenerated = 2,
  InvalidProject_OutputsSkipped = 3,
  ProjectReferenceCycle_OutputsSkipped = 4,
}

export interface ArSolutionBuilder {
  build(): ExitStatus;
  clean(): ExitStatus;
}

export interface CreateArSolutionBuilderOptions {
  verbose?: boolean;
  onDiagnostic?: (d: Diagnostic) => void;
  onStatus?: (d: Diagnostic) => void;
  schemaColumnsByTable?: ArModelsPluginOptions["schemaColumnsByTable"];
}

type Ts5Diagnostic = Parameters<NonNullable<TrailsBuildOptions["onDiagnostic"]>>[0];
type Ts5MessageChain = Exclude<Ts5Diagnostic["messageText"], string>;

/** @noRailsEquivalent CONVERGEABLE port-trails-tsc-to-ts7-api */
export function createArSolutionBuilder(
  rootConfigs: readonly string[],
  opts: CreateArSolutionBuilderOptions = {},
): ArSolutionBuilder {
  const builder = createTrailsSolutionBuilder(rootConfigs, {
    verbose: opts.verbose,
    onDiagnostic: opts.onDiagnostic && ((d) => opts.onDiagnostic!(fromTs5Diagnostic(d))),
    onStatus: opts.onStatus && ((d) => opts.onStatus!(fromTs5Diagnostic(d))),
    pluginFactory: (_plainProgram, options) => {
      const { baseNames, modelRegistry } = collectBaseDescendants(options.configFilePath as string);
      return [
        createArModelsPlugin({
          baseNames: [...baseNames],
          modelRegistry,
          schemaColumnsByTable: opts.schemaColumnsByTable,
        }),
      ];
    },
  });
  return {
    build: () => builder.build() as number,
    clean: () => builder.clean() as number,
  };
}

function fromTs5Diagnostic(d: Ts5Diagnostic): Diagnostic {
  const chain = typeof d.messageText === "string" ? undefined : d.messageText;
  const out: Diagnostic = {
    pos: d.start ?? 0,
    end: (d.start ?? 0) + (d.length ?? 0),
    code: d.code,
    category: d.category as number as DiagnosticCategory,
    text: chain ? chain.messageText : (d.messageText as string),
    messageChain: chain?.next?.map(fromTs5MessageChain),
    relatedInformation: d.relatedInformation?.map((ri) => fromTs5Diagnostic(ri as Ts5Diagnostic)),
  };
  if (!d.file || d.start == null) return out;
  const start = d.file.getLineAndCharacterOfPosition(d.start);
  const end = d.file.getLineAndCharacterOfPosition(out.end);
  const lineStarts = d.file.getLineStarts();
  const sourceLines = [];
  for (let line = start.line; line <= end.line; line++) {
    sourceLines.push({ line, text: d.file.text.slice(lineStarts[line], lineStarts[line + 1]) });
  }
  return { ...out, fileName: d.file.fileName, startPosition: start, endPosition: end, sourceLines };
}

function fromTs5MessageChain(chain: Ts5MessageChain): Diagnostic {
  return {
    pos: 0,
    end: 0,
    code: chain.code,
    category: chain.category as number as DiagnosticCategory,
    text: chain.messageText,
    messageChain: chain.next?.map(fromTs5MessageChain),
  };
}
