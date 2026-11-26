import { Base64 } from "@blazetrails/ruby-compat/base64";
import { File } from "@blazetrails/ruby-compat/file";
import { type Binding, rbFBinding } from "@blazetrails/ruby-compat/variable";

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
