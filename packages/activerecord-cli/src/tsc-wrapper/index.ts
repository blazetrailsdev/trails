export {
  createArTrailsProgram,
  createArSolutionBuilder,
  getPreEmitDiagnostics,
  remapDiagnostics,
  ExitStatus,
  type ArRemapHost,
  type ArSolutionBuilder,
  type ArTrailsProgram,
  type CreateArTrailsProgramOptions,
  type CreateArSolutionBuilderOptions,
} from "./ar-program.js";
export { createArModelsPlugin, type ArModelsPluginOptions } from "./ar-models-plugin.js";
export {
  parseSchemaTs,
  type DumpColumnSchema,
  type SchemaColumnsByTable,
} from "./schema-ts-parser.js";

export type { LineDelta, TscPlugin, VirtualizeOutput } from "@blazetrails/trails-tsc";
export { remapLine } from "@blazetrails/trails-tsc";
