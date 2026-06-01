// AR-wired convenience helpers — use these from AR-aware code so the
// `ar-models` plugin (declares + auto-import) is registered for you.
// For raw plugin control, import the neutral
// `createTrailsProgram` / `createTrailsSolutionBuilder` from
// `@blazetrails/trails-tsc` directly.
export {
  createArTrailsProgram,
  createArSolutionBuilder,
  type CreateArTrailsProgramOptions,
  type CreateArSolutionBuilderOptions,
} from "./ar-program.js";
export { createArModelsPlugin, type ArModelsPluginOptions } from "./ar-models-plugin.js";

// Re-export plugin types and remap helpers (no behavioral surprise:
// these are pure / framework-agnostic). The plugin-host primitives
// (`createTrailsProgram`, `createTrailsSolutionBuilder`,
// `buildCompilerHost`) are intentionally NOT re-exported from this
// barrel — re-exporting them under `@blazetrails/activerecord/tsc`
// would silently drop AR virtualization for callers expecting the
// pre-extraction behavior. Import them from `@blazetrails/trails-tsc`
// explicitly when raw access is needed.
export type {
  LineDelta,
  PluginFactory,
  TrailsBuildOptions,
  TrailsCompilerHost,
  TrailsProgram,
  TrailsSolutionBuilder,
  TscPlugin,
  VirtualizeOutput,
} from "@blazetrails/trails-tsc";
export { remapDiagnostics, remapLine } from "@blazetrails/trails-tsc";
