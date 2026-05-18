export { buildCompilerHost, type TrailsCompilerHost } from "./host.js";
export { createTrailsProgram, type TrailsProgram } from "./program.js";
export {
  createTrailsSolutionBuilder,
  type TrailsSolutionBuilder,
  type TrailsBuildOptions,
} from "./build.js";
export { remapDiagnostics } from "./remap.js";

// Re-export the new plugin surface so downstream packages can already
// program against it. Slot B will move host/program/build into
// `@blazetrails/trails-tsc` and refactor the AR virtualize +
// auto-import logic into a first-class `ar-models` plugin.
export type {
  LineDelta,
  PluginCompilerHost,
  TscPlugin,
  VirtualizeOutput,
} from "@blazetrails/trails-tsc";
export { buildPluginHost } from "@blazetrails/trails-tsc";
