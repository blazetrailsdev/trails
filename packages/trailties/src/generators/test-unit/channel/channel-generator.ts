import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { Base } from "../../test-unit.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class ChannelGenerator extends Base {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.checkClassCollision({ suffix: "ChannelTest" });
    this.methodAdded("createTestFiles");
  }

  /** @missingRailsArgs template — PERMANENT */
  async createTestFiles(): Promise<void> {
    await this.template(
      "channel_test.ts",
      File.join(
        "test/channels",
        ...this.classPath(),
        `${dasherize(this.fileName)}-channel.test${this.ext()}`,
      ),
    );
  }

  /** @internal */
  private __fileName?: string;

  override get fileName(): string {
    return (this.__fileName ??= super.fileName.replace(/_channel$/i, ""));
  }
}

Object.defineProperty(ChannelGenerator, "name", {
  value: "TestUnit::Generators::ChannelGenerator",
});
