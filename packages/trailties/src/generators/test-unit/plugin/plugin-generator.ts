import { File } from "@blazetrails/ruby-compat";
import { Base } from "../../test-unit.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class PluginGenerator extends Base {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.checkClassCollision({ suffix: "Test" });
    this.methodAdded("createTestFiles");
  }

  async createTestFiles(): Promise<void> {
    await this.directory(".", "test");
  }
}

Object.defineProperty(PluginGenerator, "name", { value: "TestUnit::Generators::PluginGenerator" });
