// Re-export the trails-tsc plugin surface and program/builder
// primitives so AR consumers can use a single barrel. The actual
// host/program/build/remap implementations now live in
// `@blazetrails/trails-tsc` — this package contributes only the
// `ar-models` plugin and the CLI shim that wires it up.
export type {
  BuildCompilerHostOptions,
  CreateTrailsProgramOptions,
  LineDelta,
  PluginFactory,
  TrailsBuildOptions,
  TrailsCompilerHost,
  TrailsProgram,
  TrailsSolutionBuilder,
  TscPlugin,
  VirtualizeOutput,
} from "@blazetrails/trails-tsc";
export {
  buildCompilerHost,
  createPlainProgram,
  createTrailsProgram,
  createTrailsSolutionBuilder,
  remapDiagnostics,
  remapLine,
} from "@blazetrails/trails-tsc";

export { createArModelsPlugin, type ArModelsPluginOptions } from "./ar-models-plugin.js";
