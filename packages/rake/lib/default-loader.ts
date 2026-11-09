import { File } from "@blazetrails/ruby-compat";
import { Rake } from "./rake-module.js";

export class DefaultLoader {
  async load(fn: string): Promise<void> {
    await Rake.loadRakefile(File.expandPath(fn));
  }
}
