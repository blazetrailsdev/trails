import {
  File,
  FileUtils,
  StandardError,
  block,
  extend,
  puts,
  rbObjAsString,
  stdout as $stdout,
} from "@blazetrails/ruby-compat";
import "./rake.js";
import { DSL } from "./dsl-definition.js";
import { FileList } from "./file-list.js";
import { FileUtils as RakeFileUtils } from "./file-utils.js";
import { pathmap } from "./ext/string.js";
import { Rake } from "./rake-module.js";

export const Cleaner = {
  async cleanupFiles(fileNames: FileList): Promise<void> {
    await fileNames.each(async (fileName) => {
      await Cleaner.cleanup(fileName);
    });
  },

  async cleanup(fileName: string, opts: { verbose?: boolean } = {}): Promise<void> {
    try {
      opts = { verbose: Rake.application!.options.trace, ...opts };
      await FileUtils.rmRAsync(fileName, opts);
    } catch (ex) {
      if (!(ex instanceof StandardError)) throw ex;
      if (!(await Cleaner.isFileAlreadyGone(fileName))) {
        puts.call($stdout, `Failed to remove ${fileName}: ${rbObjAsString(ex)}`);
      }
    }
  },

  /** @internal */
  async isFileAlreadyGone(fileName: string): Promise<boolean> {
    if (await File.isExistAsync(fileName)) return false;

    let path = fileName;
    let prev: string | null = null;

    while ((path = File.dirname(path))) {
      if (await Cleaner.isCantBeDeleted(path)) return false;
      if ([prev, "."].includes(path)) break;
      prev = path;
    }
    return true;
  },

  /** @internal */
  async isCantBeDeleted(pathName: string): Promise<boolean> {
    return (
      (await File.isExistAsync(pathName)) &&
      (!(await File.isReadableAsync(pathName)) || !(await File.isExecutableAsync(pathName)))
    );
  },
};

extend(Cleaner, RakeFileUtils);

export const CLEAN = FileList.get("**/*~", "**/*.bak", "**/core");
await CLEAN.clearExclude().exclude(
  block(
    async (fn: string) =>
      pathmap(fn, "%f").toLowerCase() === "core" && (await File.isDirectoryAsync(fn)),
  ),
);

DSL.desc("Remove any temporary products.");
DSL.task(
  "clean",
  block(async () => {
    await Cleaner.cleanupFiles(CLEAN);
  }),
);

export const CLOBBER = new FileList();

DSL.desc("Remove any generated files.");
DSL.task(
  { clobber: ["clean"] },
  block(async () => {
    await Cleaner.cleanupFiles(CLOBBER);
  }),
);
