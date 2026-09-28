/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rails::Generators::ResourceHelpers` (`erb/scaffold/scaffold_generator.rb:9`); the class/interface merge is how a mixin surfaces on the type side. */
import { include, type Included } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { Base } from "../../tse.js";
import { ResourceHelpers } from "../../resource-helpers.js";
import { TEMPLATES } from "./templates.js";

export interface ScaffoldGenerator extends Included<typeof ResourceHelpers> {}

export class ScaffoldGenerator extends Base {
  /** @internal */
  declare controllerName: string;
  /** @internal */
  declare controllerFileName: string;
  /** @internal */
  declare _controllerClassPath: string[];

  createRootFolder(): void {
    this.emptyDirectory(File.join("app/views", this.controllerFilePath()));
  }

  copyViewFiles(): void {
    for (const view of this.availableViews()) {
      for (const format of this.formats()) {
        const filename = this.filenameWithExtensions(view, format);
        this.createFile(
          File.join("app/views", this.controllerFilePath(), filename),
          TEMPLATES[filename].call(this),
        );
      }
    }

    this.createFile(
      File.join("app/views", this.controllerFilePath(), `_${this.singularName()}.html.tse`),
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
