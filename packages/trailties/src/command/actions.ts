import { getPath } from "@blazetrails/ruby-compat";
import { APP_PATH, ENGINE_PATH } from "../app-path.js";
import { Trails } from "../rails.js";

export async function requireApplicationBang(): Promise<void> {
  const p = getPath();
  if (!p.pathToFileURL) {
    throw new Error("PathAdapter.pathToFileURL() is required to boot an application.");
  }
  if (ENGINE_PATH != null) await import(p.pathToFileURL(ENGINE_PATH).href);
  if (APP_PATH != null) await import(p.pathToFileURL(APP_PATH).href);
}

export async function bootApplicationBang(): Promise<void> {
  await requireApplicationBang();
  if (APP_PATH != null) await Trails.application!.requireEnvironmentBang();
}

/** @missingRailsCall find — CONVERGEABLE generators-configure-bang-api-only-no-color-fallbacks-templates */
export async function loadGenerators(): Promise<void> {
  await Trails.application!.loadGenerators();
}
