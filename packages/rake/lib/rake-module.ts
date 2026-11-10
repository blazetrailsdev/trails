import { rbFLoad, TopLevel } from "@blazetrails/ruby-compat";
import type { Application } from "./application.js";
import { CpuCounter } from "./cpu-counter.js";

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
    _cpuCount ??= CpuCounter.count();
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

TopLevel.Rake = Rake;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Rake?: typeof Rake;
  }
}
