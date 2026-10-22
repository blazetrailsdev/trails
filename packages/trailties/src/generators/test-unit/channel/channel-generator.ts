import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import { TEMPLATES } from "./templates.js";

export class ChannelGenerator extends NamedBase {
  static {
    this.checkClassCollision({ suffix: "ChannelTest" });
    this.commands().push("createTestFiles");
  }

  constructor(options: NamedBaseOptions) {
    super(options);
    this.fileName = this.fileName.replace(/_channel$/i, "");
  }

  /** @missingRailsCall template — CONVERGEABLE thor-actions-template-is-unported */
  createTestFiles(): void {
    this.createFile(
      File.join(
        "test/channels",
        ...this.classPathParts,
        `${dasherize(this.fileName)}-channel.test${this.ext()}`,
      ),
      TEMPLATES.channel_test.call(this),
    );
  }
}

Object.defineProperty(ChannelGenerator, "name", {
  value: "TestUnit::Generators::ChannelGenerator",
});
