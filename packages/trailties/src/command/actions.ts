import { Rake } from "@blazetrails/rake";
import { defineModule, Dir, File, getPath } from "@blazetrails/ruby-compat";
import { APP_PATH, ENGINE_PATH, ENGINE_ROOT } from "../app-path.js";
import { Engine } from "../engine.js";
import { Generators } from "../generators.js";
import { Trails } from "../trails.js";

export function setApplicationDirectoryBang(): void {
  if (!File.isExist(File.expandPath("config.ru"))) Dir.chdir(File.expandPath("../..", APP_PATH));
}

export async function requireApplicationBang(): Promise<void> {
  const p = getPath();
  if (!p.pathToFileURL) {
    throw new Error("PathAdapter.pathToFileURL() is required to boot an application.");
  }
  if (ENGINE_PATH != null) await import(p.pathToFileURL(ENGINE_PATH).href);
  if (APP_PATH != null) await import(p.pathToFileURL(APP_PATH).href);
}

export async function bootApplicationBang(this: {
  requireApplicationBang(): Promise<void>;
}): Promise<void> {
  await this.requireApplicationBang();
  if (APP_PATH != null) await Trails.application!.requireEnvironmentBang();
}

export async function loadEnvironmentConfigBang(this: {
  requireApplicationBang(): Promise<void>;
}): Promise<void> {
  await this.requireApplicationBang();
  if (APP_PATH != null) await Trails.application!.initializeBang("_");
}

async function loadTasks(): Promise<void> {
  if (ENGINE_PATH != null) {
    await Rake.application!.init("trails");
    await Rake.application!.loadRakefile();
  } else {
    await Trails.application!.loadTasks();
  }
}

async function loadGenerators(): Promise<void> {
  if (ENGINE_PATH != null) {
    const engine = (await Engine.find(ENGINE_ROOT!))!;
    Generators.namespace = engine.trailtieNamespace() ?? null;
    await engine.loadGenerators();
  } else {
    await Trails.application!.loadGenerators();
  }
}

export const Actions = defineModule({
  setApplicationDirectoryBang,
  requireApplicationBang,
  bootApplicationBang,
  loadEnvironmentConfigBang,
  loadTasks,
  loadGenerators,
});
