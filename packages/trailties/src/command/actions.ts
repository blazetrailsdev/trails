import { getPath } from "@blazetrails/ruby-compat";
import { Dir } from "@blazetrails/ruby-compat";
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
  if (APP_PATH == null) {
    throw new Error(`No config/application.ts found in ${Dir.pwd()}.`);
  }
  await requireApplicationBang();
  await Trails.initialize();
}
