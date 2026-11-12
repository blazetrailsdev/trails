import { Base64, type Binding, File, rbFBinding } from "@blazetrails/ruby-compat";

import { ActiveRecord } from "../namespaces.js";

export class RenderContext {
  static createSubclass(): new () => {
    getBinding(): Binding;
    binary(path: string): string;
  } {
    return class extends ActiveRecord.FixtureSet.contextClass {
      getBinding(): Binding {
        return rbFBinding(this);
      }

      binary(path: string): string {
        return `!!binary "${Base64.strictEncode64(File.binread(path))}"`;
      }
    };
  }
}
