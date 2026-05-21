export type { LineDelta, TscPlugin, VirtualizeOutput } from "./plugin.js";
export {
  buildCompilerHost,
  type BuildCompilerHostOptions,
  type TrailsCompilerHost,
} from "./host.js";
export {
  createTrailsProgram,
  createPlainProgram,
  type CreateTrailsProgramOptions,
  type TrailsProgram,
} from "./program.js";
export {
  createTrailsSolutionBuilder,
  type PluginFactory,
  type TrailsBuildOptions,
  type TrailsSolutionBuilder,
} from "./build.js";
export { remapDiagnostics, remapLine } from "./remap.js";
export { createTsePlugin, virtualizeTse } from "./plugins/tse.js";
export { buildViews, type BuildViewsOptions, type BuildViewsResult } from "./build-views.js";
export { runCli } from "./cli.js";
