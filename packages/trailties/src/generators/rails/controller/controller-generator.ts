import { File } from "@blazetrails/ruby-compat";
import { dasherize, type GeneratorOptions } from "../../base.js";
import type { GeneratorClass } from "../../../generators.js";
import { NamedBase } from "../../named-base.js";
import {
  actionMethod,
  controllerPathHelpers,
  emitControllerClass,
  parentRefForRelative,
} from "./controller-paths.js";

export interface ControllerGeneratorOptions extends GeneratorOptions {
  skipRoutes?: boolean;
  helper?: boolean;
  parent?: string;
}

export class ControllerGenerator extends NamedBase {
  static {
    Object.defineProperty(this, "name", { value: "Rails::Generators::ControllerGenerator" });

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

  /**
   * @missingRailsCall template — CONVERGEABLE converge-generators-onto-thor-template
   * @missingRailsArgs join — PERMANENT
   */
  async createControllerFiles(): Promise<void> {
    const parent = this.parentClassName();
    const actions = this.actions;
    const ts = this.isTypeScript();
    const depth = this.classPathParts.length;

    const source = emitControllerClass({
      className: controllerPathHelpers(this.name).className,
      parent: parentRefForRelative(parent, depth, this.ext()),
      methods: actions.map((a) => actionMethod(a, ts)),
    });
    await this.createFile(
      File.join(
        "app/controllers",
        ...this.classPathParts.map((p) => dasherize(p)),
        `${dasherize(this.fileName)}-controller${this.ext()}`,
      ),
      source,
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

  /** @internal */
  override get fileName(): string {
    return (this.__fileName ??= this.removePossibleSuffix(super.fileName));
  }

  /** @internal */
  protected removePossibleSuffix(name: string): string {
    return name.replace(/_?controller$/i, "");
  }
}
