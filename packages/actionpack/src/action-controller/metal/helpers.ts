import { registerConstant } from "@blazetrails/ruby-compat";
import { Resolution, type HelperMethodsModule } from "../../abstract-controller/helpers.js";

let _helpersPath: string[] = [];

export function helpersPath(): string[] {
  return _helpersPath;
}

export function setHelpersPath(paths: string[]): void {
  _helpersPath = paths;
}

let _applicationHelpers: string[] = [];

/** @noRailsEquivalent PERMANENT */
export function setApplicationHelpers(
  names: string[],
  constants: Map<string, HelperMethodsModule>,
): void {
  _applicationHelpers = names;
  for (const [name, mod] of constants) registerConstant(name, mod);
}

/** @noRailsEquivalent PERMANENT */
export async function loadApplicationHelperNames(): Promise<string[]> {
  _applicationHelpers = await Resolution.allHelpersFromPath(_helpersPath);
  return _applicationHelpers;
}

/** @internal */
function allApplicationHelpers(): string[] {
  return _applicationHelpers;
}

export function modulesForHelpers(
  args: ReadonlyArray<HelperMethodsModule | string | symbol | Array<unknown>>,
): HelperMethodsModule[] {
  const rest = (args as readonly unknown[]).filter(
    (arg) => !(arg === "all" || (typeof arg === "symbol" && arg.description === "all")),
  );
  const argsWithAll = rest.length === args.length ? rest : [...rest, ...allApplicationHelpers()];
  return Resolution.modulesForHelpers(argsWithAll as Array<HelperMethodsModule | string>);
}
