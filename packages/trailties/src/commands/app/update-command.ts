import "../../constants.app-update-command.generated.js";
import {
  File,
  TopLevel,
  constDefined,
  include,
  Pathname,
  rbModName,
  chomp,
} from "@blazetrails/ruby-compat";
import { underscore } from "@blazetrails/activesupport";
import type { ThorClass } from "@blazetrails/thor";
import * as ThorActions from "@blazetrails/thor/actions";
import { Base } from "../../command/base.js";
import { Trails } from "../../trails.js";
import { AppGenerator } from "../../generators/trails/app/app-generator.js";

export class UpdateCommand extends Base {
  declare static addRuntimeOptionsBang: OmitThisParameter<
    typeof ThorActions.ClassMethods.addRuntimeOptionsBang
  >;

  static {
    const klass = this as unknown as ThorClass;
    include(this as unknown as new (...args: unknown[]) => unknown, ThorActions.Actions);
    this.addRuntimeOptionsBang();

    klass.desc(
      "update",
      "Update configs and some other initially generated files (or use just update:configs or update:bin)",
    );
    klass.methodAdded("perform");
    klass.desc("configs", "Update config files in the application config/ directory", {
      hide: true,
    });
    klass.methodAdded("configs");
    klass.desc("bin", "Add or update executables in the application bin/ directory", {
      hide: true,
    });
    klass.methodAdded("bin");
    klass.desc("public_directory", "Add or update files in the application public/ directory", {
      hide: true,
    });
    klass.methodAdded("publicDirectory");
    klass.desc("active_storage", "Run the active_storage:update command", { hide: true });
    klass.methodAdded("activeStorage");
  }

  /** @internal */
  private _appGenerator?: AppGenerator;

  /** @inlinedFrom Thor::Actions#initialize thor/v1.3.2/lib/thor/actions.rb:72-85 */
  constructor(
    args: unknown[] = [],
    options: Record<string, unknown> = {},
    config: Record<string, unknown> = {},
  ) {
    super(args as string[], options as never, config);
  }

  async perform(): Promise<void> {
    await this.requireApplicationBang();
    Trails.application!.deprecators.setSilenced(true);

    await this.configs();
    await this.bin();
    await this.publicDirectory();
    await this.activeStorage();
    this.displayUpgradeGuideInfo();
  }

  async configs(): Promise<void> {
    await this.requireApplicationBang();
    await (await this.appGenerator()).createBootFile();
    await (await this.appGenerator()).updateConfigFiles();
  }

  async bin(): Promise<void> {
    await this.requireApplicationBang();
    await (await this.appGenerator()).updateBinFiles();
  }

  async publicDirectory(): Promise<void> {
    await this.requireApplicationBang();
    await (await this.appGenerator()).createPublicFiles();
  }

  async activeStorage(): Promise<void> {
    await this.requireApplicationBang();
    await (await this.appGenerator()).updateActiveStorage();
  }

  /** @internal */
  private displayUpgradeGuideInfo(): void {
    this.say(
      "\nAfter this, check Trails upgrade guide at https://guides.rubyonrails.org/upgrading_ruby_on_rails.html for more details about upgrading your app.",
    );
  }

  /** @internal */
  private async appGenerator(): Promise<AppGenerator> {
    if (this._appGenerator === undefined) {
      const gen = new AppGenerator(["trails"], await this.generatorOptions(), {
        destinationRoot: Trails.root(),
      });
      if (
        !(await File.isExistAsync(
          new Pathname(Trails.root()!).join("config", "application.ts").toString(),
        ))
      ) {
        gen.isValidConst();
      }
      this._appGenerator = gen;
    }
    return this._appGenerator;
  }

  /** @internal */
  private async generatorOptions(): Promise<Record<string, unknown>> {
    const config = Trails.application!.config;

    return {
      ...{
        api: !!config.apiOnly,
        update: true,
        name: underscore(chomp(rbModName(Trails.application!.constructor)!, "::Application")),
        skipActiveJob: !constDefined(TopLevel, "ActiveJob::Railtie"),
        skipActiveRecord: !constDefined(TopLevel, "ActiveRecord::Railtie"),
        skipActiveStorage: !constDefined(TopLevel, "ActiveStorage::Engine"),
        skipActionMailer: !constDefined(TopLevel, "ActionMailer::Railtie"),
        skipActionMailbox: !constDefined(TopLevel, "ActionMailbox::Engine"),
        skipActionText: !constDefined(TopLevel, "ActionText::Engine"),
        skipActionCable: !constDefined(TopLevel, "ActionCable::Engine"),
        skipBrakeman: await this.isSkipGem("brakeman"),
        skipEslint: await this.isSkipGem("eslint"),
        skipThruster: await this.isSkipGem("thruster"),
        skipTest: !constDefined(TopLevel, "Trails::TestUnitRailtie"),
        skipSystemTest:
          (config.generators() as unknown as { systemTests(): unknown }).systemTests() == null,
        skipAssetPipeline: this.assetPipeline() == null,
        skipBootsnap: !constDefined(TopLevel, "Bootsnap"),
      },
      ...Object.fromEntries(this.options.toHash()),
    };
  }

  /** @internal */
  private assetPipeline(): string | undefined {
    if (constDefined(TopLevel, "Propshaft::Railtie")) return "propshaft";
  }

  /** @inventedArm readAsync — PERMANENT */
  private async isSkipGem(gemName: string): Promise<boolean> {
    const pkg = JSON.parse(await File.readAsync(File.join(Trails.root()!, "package.json"))) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return !(
      Object.hasOwn(pkg.dependencies ?? {}, gemName) ||
      Object.hasOwn(pkg.devDependencies ?? {}, gemName)
    );
  }
}
