import { Base64, File, rbFBinding } from "@blazetrails/ruby-compat";

import { ActiveRecord } from "../namespaces.js";

export class RenderContext {
  static createSubclass(): new () => {
    getBinding(): object;
    binary(path: string): string;
  } {
    return class extends ActiveRecord.FixtureSet.contextClass {
      getBinding(): this {
        return rbFBinding(this);
      }

      binary(path: string): string {
        return `!!binary "${Base64.strictEncode64(File.binread(path))}"`;
      }
    };
  }
}
