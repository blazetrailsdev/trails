import ts from "typescript";
import * as path from "node:path";
import { buildCompilerHost, type TrailsCompilerHost } from "./host.js";
import { collectBaseDescendants } from "../type-virtualization/transitive-extends-walker.js";
import { remapDiagnostics } from "./remap.js";

export interface TrailsSolutionBuilder {
  build(): ts.ExitStatus;
  clean(): ts.ExitStatus;
}

export interface TrailsBuildOptions {
  /** Emit solution-builder status messages (e.g., "Building project..."). */
  verbose?: boolean;
  /** Called with each diagnostic AFTER virtualized-source remap. */
  onDiagnostic?: (d: ts.Diagnostic) => void;
  /** Called with each solution-builder status message. */
  onStatus?: (d: ts.Diagnostic) => void;
}

/**
 * Wrap `ts.createSolutionBuilder` so every project built with `-b`
 * uses the trails-tsc virtualizing compiler host. Each project is
 * processed in two passes (plain checker → walker → virtualizing
 * host) exactly like `createTrailsProgram`, so transitive-extends
 * and auto-import resolution work per-project.
 *
 * Auto-import resolution is scoped to each project's own source
 * files — cross-project models referenced via `references:` still
 * resolve through TypeScript's normal project-reference handling
 * (the referencing project imports them explicitly, either because
 * the user wrote the import or because the referenced project's
 * emitted `.d.ts` declares them).
 */
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
      // Reuse the previous builder program if we have one — the
      // solution builder only invokes createProgram without
      // resolved inputs on a no-op incremental tick. Otherwise
      // this is unreachable for a well-formed solution, so fail
      // loudly rather than passing undefined into the TS factory.
      if (oldProgram) return oldProgram;
      throw new Error(
        "createTrailsSolutionBuilder received unresolved rootNames or compiler options",
      );
    }

    // Pass 1: plain host — we only need a checker to walk extends
    // chains and collect the per-project model registry.
    const pass1Host = ts.createCompilerHost(options, true);
    const pass1Program = ts.createProgram({
      rootNames: [...rootNames],
      options,
      host: pass1Host,
      projectReferences: projectReferences ? [...projectReferences] : undefined,
    });
    const { baseNames, modelRegistry } = collectBaseDescendants(pass1Program);

    // Pass 2: virtualizing host + registry feed the real builder
    // program. Cache the host per-project so diagnostics remap can
    // look up deltas and original text after build completes.
    const host = buildCompilerHost(options, [...baseNames], modelRegistry);
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

  // A composite host that delegates `getDeltasForFile` /
  // `getOriginalText` to whichever per-project host owns a given
  // absolute path. Lets `remapDiagnostics` remap a diagnostic whose
  // primary file lives in project A AND whose `relatedInformation`
  // entries point into project B's virtualized files. Results are
  // memoized per path so large solutions don't re-scan every host
  // for every diagnostic.
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

  // Share the original-SourceFile cache across every diagnostic so
  // we only reparse each virtualized file once per build.
  const originalSfCache = new Map<string, ts.SourceFile>();

  const reportDiagnostic: ts.DiagnosticReporter = (d) => {
    if (!buildOpts.onDiagnostic) return;
    const remapped = remapDiagnostics([d], compositeRemapHost, originalSfCache)[0]!;
    buildOpts.onDiagnostic(remapped);
  };

  const reportStatus: ts.DiagnosticReporter = (d) => {
    buildOpts.onStatus?.(d);
  };

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
