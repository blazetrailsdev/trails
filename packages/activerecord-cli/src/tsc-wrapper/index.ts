export {
  createArTrailsProgram,
  createArSolutionBuilder,
  type CreateArTrailsProgramOptions,
  type CreateArSolutionBuilderOptions,
} from "./ar-program.js";
export { createArModelsPlugin, type ArModelsPluginOptions } from "./ar-models-plugin.js";
export {
  parseSchemaTs,
  type DumpColumnSchema,
  type SchemaColumnsByTable,
} from "./schema-ts-parser.js";

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
