import { File } from "@blazetrails/ruby-compat";
import { Base } from "@blazetrails/trailties/generators";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class InstallGenerator extends Base {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.methodAdded("createTestFiles");
  }

  async createTestFiles(): Promise<void> {
    await this.template("fixtures.yml", "test/fixtures/action_text/rich_texts.yml");
  }
}

Object.defineProperty(InstallGenerator, "name", {
  value: "TestUnit::Generators::InstallGenerator",
});
