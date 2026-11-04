import { expect } from "vitest";
import { Dir, File, FileUtils, LOADED_FEATURES, TopLevel } from "@blazetrails/ruby-compat";
import { autoloadGet } from "../core-ext/kernel.js";
import { Cref } from "../cref.js";
import { SetupRequired } from "../error.js";
import { Loader } from "../loader.js";
import { ExplicitNamespaces } from "../registry/explicit-namespaces.js";
import { Registry } from "../registry.js";

export const get = (mod: object, cname: string) =>
  autoloadGet(new Cref(mod, cname)) as Promise<never>;

declare global {
  var $get: ((cname: string, mod?: object) => Promise<never>) | undefined;
}

export interface Constants {
  [cname: string]: Constants;
}

export async function newLoader({
  dirs = [],
  namespace = Object,
  enableReloading = true,
  setup = true,
}: {
  dirs?: string | string[];
  namespace?: object;
  enableReloading?: boolean;
  setup?: boolean;
} = {}): Promise<Loader> {
  const loader = new Loader();
  for (const dir of [dirs].flat()) await loader.pushDir(dir, { namespace });
  if (enableReloading) loader.enableReloading();
  if (setup) await loader.setup();
  return loader;
}

export function assertAbspath(expected: string, actual: unknown): void {
  expect(actual).toEqual(File.expandPath(expected));
}

export function isRequired(...files: [string, string?][]): boolean {
  return files.every(([file]) => LOADED_FEATURES.includes(File.expandPath(file)));
}

const topLevelConstants = new Set(Object.keys(TopLevel));

export async function resetConstants(): Promise<void> {
  for (const loader of Registry.loaders) {
    try {
      await loader.unload();
    } catch (error) {
      if (!(error instanceof SetupRequired)) throw error;
    }
  }
  for (const cname of Object.keys(TopLevel)) {
    if (!topLevelConstants.has(cname)) delete (TopLevel as Record<string, unknown>)[cname];
  }
}

function resetRegistry(): void {
  Registry.loaders.length = 0;
  Registry.loadersByPackageFile = {};
  Registry.autoloads = {};
}

function resetExplicitNamespace(): void {
  ExplicitNamespaces.clear();
}

export async function teardown(): Promise<void> {
  await resetConstants();
  resetRegistry();
  resetExplicitNamespace();
}

export async function withFiles(files: [string, string?][], block: () => unknown): Promise<void> {
  const pwd = Dir.pwd();
  const tmp = Dir.mktmpdir("zeitwerk");
  Dir.chdir(tmp);
  globalThis.$get = (cname, mod = Object) => get(mod, cname);
  try {
    for (const [fname, contents] of files) {
      FileUtils.mkdirP(File.dirname(fname));
      File.write(fname, contents ?? "");
    }
    await block();
  } finally {
    globalThis.$get = undefined;
    Dir.chdir(pwd);
    FileUtils.rmRf(tmp);
  }
}

export async function withSetup(
  loader: Loader,
  files: [string, string?][],
  { dirs, namespace = Object }: { dirs?: string[]; namespace?: object },
  block: () => unknown,
): Promise<void> {
  await withFiles(files, async () => {
    const roots = dirs ?? [...new Set(files.map(([file]) => /^(rd\d+)\//.exec(file)?.[1] ?? "."))];
    for (const dir of roots) await loader.pushDir(dir, { namespace });

    for (const [file] of files) {
      const ignored = /^(ignored|.+\/ignored)\//.exec(file);
      if (File.basename(file) === "ignored.ts") await loader.ignore(file);
      else if (ignored != null) await loader.ignore(ignored[1]);

      const collapsed = /^(collapsed|.+\/collapsed)\//.exec(file);
      if (collapsed != null) await loader.collapse(collapsed[1]);
    }

    await loader.setup();
    await block();
  });
}
