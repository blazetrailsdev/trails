import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase } from "../../named-base.js";
import { TEMPLATES } from "./templates.js";

export class ChannelGenerator extends NamedBase {
  static {
    this.checkClassCollision({ suffix: "ChannelTest" });
    this.methodAdded("createTestFiles");
  }

  /** @missingRailsCall template — CONVERGEABLE converge-generators-onto-thor-template */
  async createTestFiles(): Promise<void> {
    await this.createFile(
      File.join(
        "test/channels",
        ...this.classPathParts,
        `${dasherize(this.fileName)}-channel.test${this.ext()}`,
      ),
      TEMPLATES.channel_test.call(this, this.ext()),
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
