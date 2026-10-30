import {
  ArgumentError,
  File,
  block,
  extend,
  include,
  rbBlockGivenP,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { FileCreationTask } from "./file-creation-task.js";
import { FileTask } from "./file-task.js";
import { FileUtilsExt } from "./file-utils-ext.js";
import { MultiTask } from "./multi-task.js";
import type { NameSpace } from "./name-space.js";
import { eachDirParent, fromPathname, Rake } from "./rake-module.js";
import { Task } from "./task.js";

export const DSL = {
  task(...args: unknown[]): Task {
    return Task.defineTask(...args);
  },

  file(...args: unknown[]): Task {
    return FileTask.defineTask(...args);
  },

  fileCreate(...args: unknown[]): Task {
    return FileCreationTask.defineTask(...args);
  },

  directory(
    this: typeof FileUtilsExt & { fileCreate(...args: unknown[]): Task },
    ...args: unknown[]
  ): Task {
    args = args.flatMap((arg) => arg);
    const blockArg = rbBlockGivenP(args.at(-1)) ? [args.pop()] : [];
    const result = this.fileCreate(...args, ...blockArg);
    let dir = Rake.application!.resolveArgs(args)[0];
    dir = fromPathname(dir);
    eachDirParent(dir as string, (d) => {
      this.fileCreate(
        d,
        block(async (t: Task) => {
          if (!(await File.isExistAsync(t.name))) await this.mkdirP(t.name);
        }),
      );
    });
    return result;
  },

  multitask(...args: unknown[]): Task {
    return MultiTask.defineTask(...args);
  },

  namespace(name: unknown = null, block: (ns: NameSpace) => unknown): NameSpace {
    if (typeof name !== "string" && rbObjRespondTo(name, "toStr")) {
      name = (name as { toStr(): unknown }).toStr();
    }
    if (typeof name !== "string" && name != null) {
      throw new ArgumentError("Expected a String or Symbol for a namespace name");
    }
    return Rake.application!.inNamespace(name as string | null, block);
  },

  rule(...args: unknown[]): void {
    Task.createRule(...args);
  },

  desc(description: string): void {
    Rake.application!.lastDescription = description;
  },

  import(...fns: string[]): void {
    for (const fn of fns) {
      Rake.application!.addImport(fn);
    }
  },
};

include(DSL, FileUtilsExt);

extend(Rake, FileUtilsExt);
