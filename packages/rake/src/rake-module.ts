import { File, getOs, rbFLoad, rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { Application } from "./application.js";

let _application: Application | undefined;
let _cpuCount: number | undefined;

export const Rake: {
  FileUtilsExt?: typeof import("./file-utils-ext.js").FileUtilsExt;
  Application?: typeof Application;
  CommandLineOptionError?: typeof import("./application.js").CommandLineOptionError;
  application?: Application;
  suggestedThreadCount(): number;
  originalDir(): string;
  loadRakefile(path: string): Promise<true>;
  addRakelib(...files: string[]): void;
  withApplication(
    blockApplication: ((app: Application) => unknown) | Application,
    block?: (app: Application) => unknown,
  ): Promise<Application>;
} = {
  get application() {
    return (_application ??= new Rake.Application!());
  },

  set application(app) {
    _application = app;
  },

  suggestedThreadCount() {
    _cpuCount ??= getOs().availableParallelism();
    return _cpuCount + 4;
  },

  originalDir() {
    return Rake.application!.originalDir;
  },

  loadRakefile(path) {
    return rbFLoad(path);
  },

  addRakelib(...files) {
    Rake.application!.options.rakelib ??= [];
    Rake.application!.options.rakelib.push(...files);
  },

  async withApplication(blockApplication, block) {
    if (block === undefined) {
      block = blockApplication as (app: Application) => unknown;
      blockApplication = new Rake.Application!();
    }
    const origApplication = Rake.application;

    Rake.application = blockApplication as Application;

    try {
      await block(blockApplication as Application);

      return blockApplication as Application;
    } finally {
      Rake.application = origApplication;
    }
  },
};

export function eachDirParent(dir: string, block: (dir: string) => unknown): void {
  let oldLength: number | null = null;
  while (dir !== "." && dir.length !== oldLength) {
    block(dir);
    oldLength = dir.length;
    dir = File.dirname(dir);
  }
}

export function fromPathname(path: unknown): unknown {
  if (rbObjRespondTo(path, "toPath")) path = (path as { toPath(): unknown }).toPath();
  if (typeof path !== "string" && rbObjRespondTo(path, "toStr"))
    path = (path as { toStr(): unknown }).toStr();
  return path;
}
