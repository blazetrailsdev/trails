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
