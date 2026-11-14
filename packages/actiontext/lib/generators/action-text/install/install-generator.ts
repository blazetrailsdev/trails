import { File } from "@blazetrails/ruby-compat";
import type * as ThorActions from "@blazetrails/thor/actions";
import { Base } from "@blazetrails/trailties/generators";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class InstallGenerator extends Base {
  static {
    this.methodAdded("installJavascriptDependencies");
    this.methodAdded("appendJavascriptDependencies");
    this.methodAdded("createActiontextFiles");
    this.methodAdded("enableImageProcessingGem");
    this.methodAdded("createMigrations");
    this.methodAdded("isUsingJsRuntime");
    this.methodAdded("isUsingBun");
    this.methodAdded("isUsingNode");
  }

  declare run: OmitThisParameter<typeof ThorActions.run>;
  declare insertIntoFile: OmitThisParameter<typeof ThorActions.Actions.insertIntoFile>;
  declare copyFile: OmitThisParameter<typeof ThorActions.Actions.copyFile>;
  declare uncommentLines: OmitThisParameter<typeof ThorActions.Actions.uncommentLines>;

  /** @internal */
  private _usingJsRuntime?: boolean;
  /** @internal */
  private _usingBun?: boolean;
  /** @internal */
  private _usingNode?: boolean;

  /** @missingRailsArgs run — PERMANENT */
  async installJavascriptDependencies(): Promise<void> {
    this.say("Installing JavaScript dependencies", "green");
    if (await this.isUsingBun()) {
      await this.run("bun add @rails/actiontext trix");
    } else if (await this.isUsingNode()) {
      await this.run("pnpm add @rails/actiontext trix");
    }
  }

  async appendJavascriptDependencies(): Promise<void> {
    const destination = this.destinationRoot;

    const applicationJavascriptPath = File.join(destination, "app/javascript/application.js");
    if (await File.isExistAsync(applicationJavascriptPath)) {
      await this.insertIntoFile(
        applicationJavascriptPath,
        `\nimport "trix"\nimport "@rails/actiontext"\n`,
      );
    } else {
      this.say(
        "You must import the @rails/actiontext and trix JavaScript modules in your application entrypoint.\n",
        "green",
      );
    }

    const importmapPath = File.join(destination, "config/importmap.rb");
    if (await File.isExistAsync(importmapPath)) {
      await this.appendToFile(
        importmapPath,
        `pin "trix"\npin "@rails/actiontext", to: "actiontext.esm.js"\n`,
      );
    }
  }

  async createActiontextFiles(): Promise<void> {
    await this.template("actiontext.css", "app/assets/stylesheets/actiontext.css");

    const gemRoot = `${__dir__}/../../../..`;

    await this.copyFile(
      `${gemRoot}/app/views/active_storage/blobs/_blob.html.tse`,
      "app/views/active_storage/blobs/_blob.html.tse",
    );

    await this.copyFile(
      `${gemRoot}/app/views/layouts/action_text/contents/_content.html.tse`,
      "app/views/layouts/action_text/contents/_content.html.tse",
    );
  }

  async enableImageProcessingGem(): Promise<void> {
    const gemfilePath = File.join(this.destinationRoot, "package.json");
    if (await File.isExistAsync(gemfilePath)) {
      this.say(
        "Ensure image_processing gem has been enabled so image uploads will work (remember to bundle!)",
      );
      const imageProcessingRegex = /"@blazetrails\/image-processing"/;
      if (
        (await File.readlinesAsync(gemfilePath)).filter((l) => imageProcessingRegex.test(l))
          .length > 0
      ) {
        await this.uncommentLines(gemfilePath, imageProcessingRegex);
      } else {
        await this.gem("@blazetrails/image-processing");
      }
    }
  }

  async createMigrations(): Promise<void> {
    await this.trailsCommand("railties:install:migrations FROM=active_storage,action_text", {
      inline: true,
    });
  }

  async isUsingJsRuntime(): Promise<boolean> {
    return (this._usingJsRuntime ||= await File.isExistAsync(
      File.join(this.destinationRoot, "package.json"),
    ));
  }

  async isUsingBun(): Promise<boolean> {
    return (this._usingBun ||=
      (await this.isUsingJsRuntime()) &&
      (await File.isExistAsync(File.join(this.destinationRoot, "bun.config.js"))));
  }

  async isUsingNode(): Promise<boolean> {
    return (this._usingNode ||=
      (await this.isUsingJsRuntime()) &&
      !(await File.isExistAsync(File.join(this.destinationRoot, "bun.config.js"))));
  }

  static {
    this.hookFor("testFramework");
  }
}

InstallGenerator.sourceRoot(File.expandPath("templates", __dir__));

Object.defineProperty(InstallGenerator, "name", {
  value: "ActionText::Generators::InstallGenerator",
});
