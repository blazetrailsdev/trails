import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase } from "../../named-base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class ChannelGenerator extends NamedBase {
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
        ...this.classPathParts,
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
