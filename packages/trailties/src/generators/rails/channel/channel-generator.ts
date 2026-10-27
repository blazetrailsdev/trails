import { File } from "@blazetrails/ruby-compat";
import type * as ThorActions from "@blazetrails/thor/actions";
import { dasherize } from "../../base.js";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import { TEMPLATES } from "./templates.js";

export interface ChannelGeneratorOptions extends NamedBaseOptions {
  assets?: boolean;
}

export class ChannelGenerator extends NamedBase {
  declare options: ChannelGeneratorOptions;
  actions: string[];
  declare run: OmitThisParameter<typeof ThorActions.run>;
  declare gsubFile: OmitThisParameter<typeof ThorActions.Actions.gsubFile>;

  static {
    this.classOption("assets", { type: "boolean" });
    this.checkClassCollision({ suffix: "Channel" });
    this.hookFor("testFramework");
    this.commands().push("createChannelFiles");
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

  constructor(options: ChannelGeneratorOptions) {
    super(options);
    this.actions = options.attributes ?? [];
    this.fileName = this.fileName.replace(/_channel$/i, "");
  }

  async createChannelFiles(): Promise<void> {
    this.createSharedChannelFiles();
    this.createChannelFile();

    if (await this.isUsingJavascript()) {
      if (await this.isFirstSetupRequired()) {
        this.createSharedChannelJavascriptFiles();
        await this.importChannelsInJavascriptEntrypoint();

        if (await this.isUsingImportmap()) {
          this.pinJavascriptDependencies();
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
   * @missingRailsCall copy_file — CONVERGEABLE converge-generator-base-file-actions-onto-thor-actions
   */
  private createSharedChannelFiles(): void {
    if (this.behavior !== "invoke") return;

    this.createFile(
      `app/channels/application-cable/channel${this.ext()}`,
      TEMPLATES["application_cable/channel.rb"](),
    );
    this.createFile(
      `app/channels/application-cable/connection${this.ext()}`,
      TEMPLATES["application_cable/connection.rb"](),
    );
  }

  /**
   * @internal
   * @missingRailsCall template — CONVERGEABLE converge-generator-base-file-actions-onto-thor-actions
   */
  private createChannelFile(): void {
    this.createFile(
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
   * @missingRailsCall template — CONVERGEABLE converge-generator-base-file-actions-onto-thor-actions
   */
  private createSharedChannelJavascriptFiles(): void {
    this.createFile("app/javascript/channels/index.js", TEMPLATES["javascript/index.js"]());
    this.createFile("app/javascript/channels/consumer.js", TEMPLATES["javascript/consumer.js"]());
  }

  /**
   * @internal
   * @missingRailsCall js_template — CONVERGEABLE converge-generator-base-file-actions-onto-thor-actions
   */
  private async createChannelJavascriptFile(): Promise<void> {
    const channelJsPath = File.join(
      "app/javascript/channels",
      ...this.classPathParts,
      `${dasherize(this.fileName)}-channel`,
    );
    this.createFile(`${channelJsPath}.js`, TEMPLATES["javascript/channel.js"].call(this, ".js"));
    if (!(await this.isUsingJsRuntime()))
      await this.gsubFile(`${channelJsPath}.js`, /\.\/consumer/, "channels/consumer");
  }

  /** @internal */
  private async importChannelsInJavascriptEntrypoint(): Promise<void> {
    this.appendToFile(
      "app/javascript/application.js",
      (await this.isUsingJsRuntime()) ? `import "./channels"\n` : `import "channels"\n`,
    );
  }

  /** @internal */
  private async importChannelInJavascriptEntrypoint(): Promise<void> {
    this.appendToFile(
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
  private pinJavascriptDependencies(): void {
    this.appendToFile(
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
  private root(): string {
    return (this._root ||= this.destinationRoot);
  }
}

Object.defineProperty(ChannelGenerator, "name", { value: "Rails::Generators::ChannelGenerator" });
