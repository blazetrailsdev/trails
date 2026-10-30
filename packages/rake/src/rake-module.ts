import { File, rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { TaskManager } from "./task-manager.js";

export const Rake: {
  FileUtilsExt?: typeof import("./file-utils-ext.js").FileUtilsExt;
  application?: TaskManager & {
    name: string;
    addImport(fn: string): unknown;
    options: {
      buildAll?: boolean;
      traceRules?: boolean;
      traceOutput?: { puts(...strings: string[]): unknown };
    };
  };
} = {};

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
