// `build-freshness.ts` asks a solution builder whether each referenced project
// is up to date. `ts.UpToDateStatusType` and
// `SolutionBuilder#getUpToDateStatusOfProject` are real, stable parts of
// TypeScript's public runtime surface (`require("typescript").UpToDateStatusType`
// is populated) but are marked `@internal` in the compiler sources, so the
// shipped `typescript.d.ts` omits them. This augmentation declares the shape we
// depend on rather than casting through `any` at each call site — an upgrade
// that removes either member fails here, at one named place, instead of
// silently degrading the staleness check.
//
// Members are declared without initializers on purpose: we consume the enum by
// name and via its reverse map, never by numeric value, and pinning literals
// here would encode ordering that is not ours to guarantee.
declare module "typescript" {
  export enum UpToDateStatusType {
    Unbuildable,
    UpToDate,
    UpToDateWithUpstreamTypes,
    OutputMissing,
    ErrorReadingFile,
    OutOfDateWithSelf,
    OutOfDateWithUpstream,
    OutOfDateBuildInfoWithPendingEmit,
    OutOfDateBuildInfoWithErrors,
    OutOfDateOptions,
    OutOfDateRoots,
    UpstreamOutOfDate,
    UpstreamBlocked,
    ComputingUpstream,
    TsVersionOutputOfDate,
    UpToDateWithInputFileText,
    ContainerOnly,
    ForceBuild,
  }

  export interface SolutionBuilder<_T extends BuilderProgram> {
    getUpToDateStatusOfProject(configFileName: string): { type: UpToDateStatusType };
  }
}

export {};
