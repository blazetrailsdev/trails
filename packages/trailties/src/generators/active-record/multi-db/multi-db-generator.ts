import { File } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class MultiDbGenerator extends Base {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.methodAdded("createMultiDb");
  }

  async createMultiDb(): Promise<void> {
    const filename = `multi-db${this.ext()}`;
    await this.template(filename, `config/initializers/${filename}`);
  }
}

Object.defineProperty(MultiDbGenerator, "name", {
  value: "ActiveRecord::Generators::MultiDbGenerator",
});
