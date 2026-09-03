import {
  createPlainProgram,
  createTrailsProgram,
  createTrailsSolutionBuilder,
  type TrailsBuildOptions,
  type TrailsProgram,
  type TrailsSolutionBuilder,
} from "@blazetrails/trails-tsc";
import { collectBaseDescendants } from "@blazetrails/activerecord/type-virtualization/transitive-extends-walker.js";
import { createArModelsPlugin, type ArModelsPluginOptions } from "./ar-models-plugin.js";

export interface CreateArTrailsProgramOptions {
  schemaColumnsByTable?: ArModelsPluginOptions["schemaColumnsByTable"];
}

export function createArTrailsProgram(
  configPath: string,
  opts: CreateArTrailsProgramOptions = {},
): TrailsProgram {
  const pass1 = createPlainProgram(configPath);
  if (pass1.configDiagnostics.length > 0) return pass1;
  const { baseNames, modelRegistry } = collectBaseDescendants(pass1.program);
  const plugin = createArModelsPlugin({
    baseNames: [...baseNames],
    modelRegistry,
    schemaColumnsByTable: opts.schemaColumnsByTable,
  });
  return createTrailsProgram(configPath, { plugins: [plugin] });
}

export interface CreateArSolutionBuilderOptions extends Omit<TrailsBuildOptions, "pluginFactory"> {
  schemaColumnsByTable?: ArModelsPluginOptions["schemaColumnsByTable"];
}

export function createArSolutionBuilder(
  rootConfigs: readonly string[],
  opts: CreateArSolutionBuilderOptions = {},
): TrailsSolutionBuilder {
  return createTrailsSolutionBuilder(rootConfigs, {
    ...opts,
    pluginFactory: (plainProgram) => {
      const { baseNames, modelRegistry } = collectBaseDescendants(plainProgram);
      return [
        createArModelsPlugin({
          baseNames: [...baseNames],
          modelRegistry,
          schemaColumnsByTable: opts.schemaColumnsByTable,
        }),
      ];
    },
  });
}
