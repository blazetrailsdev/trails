import {
  createPlainProgram,
  createTrailsProgram,
  createTrailsSolutionBuilder,
  type TrailsBuildOptions,
  type TrailsProgram,
  type TrailsSolutionBuilder,
} from "@blazetrails/trails-tsc";
import { collectBaseDescendants } from "../type-virtualization/transitive-extends-walker.js";
import { createArModelsPlugin, type ArModelsPluginOptions } from "./ar-models-plugin.js";

export interface CreateArTrailsProgramOptions {
  schemaColumnsByTable?: ArModelsPluginOptions["schemaColumnsByTable"];
}

/**
 * AR-wired `createTrailsProgram`: runs a preliminary plain pass to
 * discover transitive `Base` descendants, then builds and registers
 * the `ar-models` plugin so AR models get their declares synthesized.
 * Use this when calling trails-tsc programmatically from AR-aware
 * code; for raw plugin control, import `createTrailsProgram` directly
 * from `@blazetrails/trails-tsc`.
 */
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

/**
 * AR-wired `createTrailsSolutionBuilder`: registers a per-project
 * `pluginFactory` that walks each project's plain program for `Base`
 * descendants before constructing the `ar-models` plugin.
 */
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
