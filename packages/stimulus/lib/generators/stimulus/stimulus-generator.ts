import { File } from "@blazetrails/ruby-compat";
import { underscore } from "@blazetrails/activesupport";
import { NamedBase, type GeneratorOptions } from "@blazetrails/trailties/generators";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class StimulusGenerator extends NamedBase {
  static {
    this.sourceRoot(File.expandPath("templates", __dir__));
    this.classOption("skipManifest", {
      type: "boolean",
      default: false,
      desc: "Don't update the stimulus manifest",
    });
    this.methodAdded("copyViewFiles");
  }

  declare options: GeneratorOptions & { skipManifest?: boolean };

  /** @internal */
  attribute?: string;

  /**
   * @missingRailsCall root — PERMANENT
   * @missingRailsCall join — PERMANENT
   * @missingRailsCall exist — PERMANENT
   */
  async copyViewFiles(): Promise<void> {
    this.attribute = this.stimulusAttributeValue(this.controllerName());
    await this.template(
      "controller.js",
      `app/javascript/controllers/${this.controllerName()}_controller.js`,
    );
    if (!this.options.skipManifest) await this.trailsCommand("stimulus:manifest:update");
  }

  /** @internal */
  private controllerName(): string {
    return underscore(this.name).replace(/_controller$/, "");
  }

  /** @internal */
  private stimulusAttributeValue(controllerName: string): string {
    return controllerName.replaceAll("/", "--").replaceAll("_", "-");
  }
}

Object.defineProperty(StimulusGenerator, "name", { value: "StimulusGenerator" });
