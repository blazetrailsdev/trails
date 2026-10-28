import { File } from "@blazetrails/ruby-compat";
import type * as ThorActions from "@blazetrails/thor/actions";
import { dasherize, type GeneratorOptions } from "../../base.js";
import { NamedBase } from "../../named-base.js";
import { TEMPLATES } from "./templates.js";

export interface ChannelGeneratorOptions extends GeneratorOptions {
  assets?: boolean;
}

export class ChannelGenerator extends NamedBase {
  declare options: ChannelGeneratorOptions;
  declare actions: string[];
  declare run: OmitThisParameter<typeof ThorActions.run>;
  declare gsubFile: OmitThisParameter<typeof ThorActions.Actions.gsubFile>;

  static {
    this.argument("actions", { type: "array", default: [], banner: "method method" });
    this.classOption("assets", { type: "boolean" });
    this.checkClassCollision({ suffix: "Channel" });
    this.hookFor("testFramework");
    this.methodAdded("createChannelFiles");
  }

  /** @internal */
  private _usingJavascript?: boolean;
  /** @internal */
  private _usingJsRuntime?: boolean;
  /** @internal */
  private _usingBun?: boolean;
  /** @internal */
  private _usingNode?: boolean;
  /** @internal */
  private _usingImportmap?: boolean;
  /** @internal */
  private _root?: string;

  async createChannelFiles(): Promise<void> {
    await this.createSharedChannelFiles();
    await this.createChannelFile();

    if (await this.isUsingJavascript()) {
      if (await this.isFirstSetupRequired()) {
        await this.createSharedChannelJavascriptFiles();
        await this.importChannelsInJavascriptEntrypoint();

        if (await this.isUsingImportmap()) {
          await this.pinJavascriptDependencies();
        } else if (await this.isUsingJsRuntime()) {
          await this.installJavascriptDependencies();
        }
      }

      await this.createChannelJavascriptFile();
      await this.importChannelInJavascriptEntrypoint();
    }
  }

  /**
   * @internal
   * @missingRailsCall copy_file — CONVERGEABLE converge-generators-onto-thor-template
   */
  private async createSharedChannelFiles(): Promise<void> {
    if (this.behavior !== "invoke") return;

    await this.createFile(
      `app/channels/application-cable/channel${this.ext()}`,
      TEMPLATES["application_cable/channel.rb"](),
    );
    await this.createFile(
      `app/channels/application-cable/connection${this.ext()}`,
      TEMPLATES["application_cable/connection.rb"](),
    );
  }

  /**
   * @internal
   * @missingRailsCall template — CONVERGEABLE converge-generators-onto-thor-template
   */
  private async createChannelFile(): Promise<void> {
    await this.createFile(
      File.join(
        "app/channels",
        ...this.classPathParts,
        `${dasherize(this.fileName)}-channel${this.ext()}`,
      ),
      TEMPLATES["channel.rb"].call(this, this.ext()),
    );
  }

  /**
   * @internal
   * @missingRailsCall template — CONVERGEABLE converge-generators-onto-thor-template
   */
  private async createSharedChannelJavascriptFiles(): Promise<void> {
    await this.createFile("app/javascript/channels/index.js", TEMPLATES["javascript/index.js"]());
    await this.createFile(
      "app/javascript/channels/consumer.js",
      TEMPLATES["javascript/consumer.js"](),
    );
  }

  /**
   * @internal
   * @missingRailsCall js_template — CONVERGEABLE converge-generators-onto-thor-template
   */
  private async createChannelJavascriptFile(): Promise<void> {
    const channelJsPath = File.join(
      "app/javascript/channels",
      ...this.classPathParts,
      `${dasherize(this.fileName)}-channel`,
    );
    await this.createFile(
      `${channelJsPath}.js`,
      TEMPLATES["javascript/channel.js"].call(this, ".js"),
    );
    if (!(await this.isUsingJsRuntime()))
      await this.gsubFile(`${channelJsPath}.js`, /\.\/consumer/, "channels/consumer");
  }

  /** @internal */
  private async importChannelsInJavascriptEntrypoint(): Promise<void> {
    await this.appendToFile(
      "app/javascript/application.js",
      (await this.isUsingJsRuntime()) ? `import "./channels"\n` : `import "channels"\n`,
    );
  }

  /** @internal */
  private async importChannelInJavascriptEntrypoint(): Promise<void> {
    await this.appendToFile(
      "app/javascript/channels/index.js",
      (await this.isUsingJsRuntime())
        ? `import "./${dasherize(this.fileName)}-channel"\n`
        : `import "channels/${dasherize(this.fileName)}-channel"\n`,
    );
  }

  /** @internal */
  private async installJavascriptDependencies(): Promise<void> {
    this.say("Installing JavaScript dependencies", "green");
    if (await this.isUsingBun()) {
      await this.run("bun add @rails/actioncable");
    } else if (await this.isUsingNode()) {
      await this.run("yarn add @rails/actioncable");
    }
  }

  /** @internal */
  private async pinJavascriptDependencies(): Promise<void> {
    await this.appendToFile(
      "config/importmap.rb",
      `pin "@rails/actioncable", to: "actioncable.esm.js"
pin_all_from "app/javascript/channels", under: "channels"
`,
    );
  }

  /** @internal */
  private async isFirstSetupRequired(): Promise<boolean> {
    return !(await File.isExistAsync(File.join(this.root(), "app/javascript/channels/index.js")));
  }

  /** @internal */
  private async isUsingJavascript(): Promise<boolean> {
    return (this._usingJavascript ||=
      !!this.options.assets && (await File.isExistAsync(File.join(this.root(), "app/javascript"))));
  }

  /** @internal */
  private async isUsingJsRuntime(): Promise<boolean> {
    return (this._usingJsRuntime ||= await File.isExistAsync(
      File.join(this.root(), "package.json"),
    ));
  }

  /** @internal */
  private async isUsingBun(): Promise<boolean> {
    return (this._usingBun ||=
      (await this.isUsingJsRuntime()) &&
      (await File.isExistAsync(File.join(this.root(), "bun.config.js"))));
  }

  /** @internal */
  private async isUsingNode(): Promise<boolean> {
    return (this._usingNode ||=
      (await this.isUsingJsRuntime()) &&
      !(await File.isExistAsync(File.join(this.root(), "bun.config.js"))));
  }

  /** @internal */
  private async isUsingImportmap(): Promise<boolean> {
    return (this._usingImportmap ||= await File.isExistAsync(
      File.join(this.root(), "config/importmap.rb"),
    ));
  }

  /** @internal */
  private __fileName?: string;

  override get fileName(): string {
    return (this.__fileName ??= super.fileName.replace(/_channel$/i, ""));
  }

  /** @internal */
  private root(): string {
    return (this._root ||= this.destinationRoot);
  }
}

Object.defineProperty(ChannelGenerator, "name", { value: "Rails::Generators::ChannelGenerator" });
