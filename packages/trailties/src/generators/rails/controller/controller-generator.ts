import { File } from "@blazetrails/ruby-compat";
import { dasherize, type GeneratorOptions } from "../../base.js";
import type { GeneratorClass } from "../../../generators.js";
import { NamedBase } from "../../named-base.js";
import { controllerPathHelpers, parentRefForRelative } from "./controller-paths.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export interface ControllerGeneratorOptions extends GeneratorOptions {
  skipRoutes?: boolean;
  helper?: boolean;
  parent?: string;
}

export class ControllerGenerator extends NamedBase {
  static {
    Object.defineProperty(this, "name", { value: "Rails::Generators::ControllerGenerator" });
    void this.sourceRoot(File.expandPath("templates", __dir__));

    this.argument("actions", { type: "array", default: [], banner: "action action" });
    this.classOption("skipRoutes", {
      type: "boolean",
      desc: "Don't add routes to config/routes.rb.",
    });
    this.classOption("helper", { type: "boolean" });
    this.classOption("parent", {
      type: "string",
      default: "ApplicationController",
      desc: "The parent class for the generated controller",
    });

    this.checkClassCollision({ suffix: "Controller" });

    this.methodAdded("createControllerFiles");
    this.methodAdded("addRoutes");

    this.hookFor(
      "templateEngine",
      "testFramework",
      "helper",
      function (this: ControllerGenerator, generator: GeneratorClass) {
        return this.invoke(generator, [this.removePossibleSuffix(this.name), this.actions]);
      },
    );
  }

  declare options: ControllerGeneratorOptions;
  declare actions: string[];
  /** @internal */
  private __fileName?: string;

  /** @missingRailsArgs template — PERMANENT */
  async createControllerFiles(): Promise<void> {
    await this.template(
      "controller.ts",
      File.join(
        "app/controllers",
        ...this.classPathParts.map((p) => dasherize(p)),
        `${dasherize(this.fileName)}-controller${this.ext()}`,
      ),
    );
  }

  async addRoutes(): Promise<void> {
    if (this.options.skipRoutes) return;
    if (this.actions.length === 0) return;
    const routingCode = this.actions
      .map((action) => `this.get(${JSON.stringify(`${this.fileName}/${action}`)});`)
      .join("\n");
    await this.route(routingCode, { namespace: this.regularClassPath() });
  }

  /** @internal */
  private parentClassName(): string {
    return this.options.parent!;
  }

  /** @noRailsEquivalent PERMANENT */
  private parentRef() {
    return parentRefForRelative(this.parentClassName(), this.classPathParts.length, this.ext());
  }

  /** @noRailsEquivalent PERMANENT */
  private parentClass(): string {
    return Object.keys(this.parentRef().import.named!)[0];
  }

  /** @noRailsEquivalent PERMANENT */
  private parentPath(): string {
    return this.parentRef().import.from;
  }

  /** @noRailsEquivalent PERMANENT */
  private controllerClassName(): string {
    return controllerPathHelpers(this.name).className;
  }

  /** @internal */
  override get fileName(): string {
    return (this.__fileName ??= this.removePossibleSuffix(super.fileName));
  }

  /** @internal */
  protected removePossibleSuffix(name: string): string {
    return name.replace(/_?controller$/i, "");
  }
}
