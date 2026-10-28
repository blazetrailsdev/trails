import { File } from "@blazetrails/ruby-compat";
import { dasherize, type GeneratorConfig } from "../../base.js";
import { NamedBase } from "../../named-base.js";
import { TEMPLATES } from "./templates.js";

export class ChannelGenerator extends NamedBase {
  static {
    this.checkClassCollision({ suffix: "ChannelTest" });
    this.methodAdded("createTestFiles");
  }

  constructor(args: unknown[] = [], localOptions: unknown = {}, config: GeneratorConfig = {}) {
    super(args, localOptions, config);
    this.fileName = this.fileName.replace(/_channel$/i, "");
  }

  /** @missingRailsCall template — CONVERGEABLE converge-generator-base-create-file-onto-thor-actions */
  createTestFiles(): void {
    this.createFile(
      File.join(
        "test/channels",
        ...this.classPathParts,
        `${dasherize(this.fileName)}-channel.test${this.ext()}`,
      ),
      TEMPLATES.channel_test.call(this, this.ext()),
    );
  }
}

Object.defineProperty(ChannelGenerator, "name", {
  value: "TestUnit::Generators::ChannelGenerator",
});
