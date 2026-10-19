/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rails::Generators::ResourceHelpers` (`erb/scaffold/scaffold_generator.rb:9`); the class/interface merge is how a mixin surfaces on the type side. */
import {
  dasherize,
  include,
  type Included,
  pluralize,
  singularize,
  underscore,
} from "@blazetrails/activesupport";
import { GeneratorError } from "../../generated-attribute.js";
import { ModelHelpers, type ModelHelpersOptions } from "../../model-helpers.js";
import type { GeneratorOptions } from "../../base.js";
import { format, File } from "@blazetrails/ruby-compat";
import { Base } from "../../tse.js";
import { ResourceHelpers } from "../../resource-helpers.js";
import { TEMPLATES } from "./templates.js";

export interface ScaffoldGenerator
  extends Included<typeof ResourceHelpers>, Included<typeof ModelHelpers> {}

export class ScaffoldGenerator extends Base {
  /** @internal */
  declare controllerName: string;
  /** @internal */
  declare controllerFileName: string;
  /** @internal */
  declare _controllerClassPath: string[];

  declare options: GeneratorOptions & ModelHelpersOptions & { modelName?: string };

  /** @inlinedFrom Rails::Generators::ResourceHelpers#initialize rails/v8.0.2/railties/lib/rails/generators/resource_helpers.rb:17-26 */
  constructor(options: ConstructorParameters<typeof Base>[0]) {
    super(options);
    const controllerName = this.name;
    if (this.options.modelName != null) {
      this.name = this.options.modelName;
      this.assignNamesBang(this.name);
    }

    this.assignControllerNamesBang(pluralize(controllerName));

    if (this.isPluralModelName(this.name) && !this.options.forcePlural) {
      const singular = singularize(this.name);
      if (!ModelHelpers.skipWarn) {
        this.say(format(ModelHelpers.PLURAL_MODEL_NAME_WARN_MESSAGE, this.name, singular));
      }
      this.name = (this.options as { name?: string }).name = singular;
      this.assignNamesBang(this.name);
    }
    if (this.isInflectionImpossible(this.name)) {
      const option1 = underscore(singularize(this.name));
      const option2 = singularize(underscore(pluralize(this.name)));
      throw new GeneratorError(
        format(ModelHelpers.INFLECTION_IMPOSSIBLE_ERROR_MESSAGE, this.name, option1, option2),
      );
    }
    if (this.isIrregularModelName(this.name) && !ModelHelpers.skipWarn) {
      this.say(format(ModelHelpers.IRREGULAR_MODEL_NAME_WARN_MESSAGE, pluralize(this.name)));
    }
    ModelHelpers.skipWarn = true;
  }

  createRootFolder(): void {
    this.emptyDirectory(File.join("app/views", dasherize(this.controllerFilePath())));
  }

  copyViewFiles(): void {
    const viewDirectory = dasherize(this.controllerFilePath());
    for (const view of this.availableViews()) {
      for (const format of this.formats()) {
        const filename = this.filenameWithExtensions(view, format);
        this.createFile(
          File.join("app/views", viewDirectory, filename),
          TEMPLATES[filename].call(this),
        );
      }
    }

    this.createFile(
      File.join("app/views", viewDirectory, `_${this.singularName()}.html.tse`),
      TEMPLATES["partial.html.tse"].call(this),
    );
  }

  run(): string[] {
    this.createRootFolder();
    this.copyViewFiles();
    return this.getCreatedFiles();
  }

  private availableViews(): string[] {
    return ["index", "edit", "show", "new", "_form"];
  }
}

include(ScaffoldGenerator, ResourceHelpers);
