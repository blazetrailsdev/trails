import { Base64, File } from "@blazetrails/ruby-compat";

import { FixtureSet } from "../fixtures.js";

export class RenderContext {
  static createSubclass(): new () => {
    getBinding(): object;
    binary(path: string): string;
  } {
    return class extends FixtureSet.contextClass {
      getBinding(): this {
        return this;
      }

      binary(path: string): string {
        return `!!binary "${Base64.strictEncode64(File.binread(path))}"`;
      }
    };
  }
}
