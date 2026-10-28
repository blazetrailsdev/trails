import type { GeneratorBase, GeneratorOptions, GeneratorConfig } from "../../base.js";
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
  declare options: ControllerGeneratorOptions;
  declare actions: string[];

  constructor(args: unknown[] = [], localOptions: unknown = {}, config: GeneratorConfig = {}) {
    super(args, localOptions, config);
    this.fileName = this.removePossibleSuffix(this.fileName);
  }

  /** @missingRailsCall template — CONVERGEABLE converge-generator-base-create-file-onto-thor-actions */
  createControllerFiles(): void {
    const parent = this.parentClassName();
    const actions = this.actions;
    const paths = controllerPathHelpers(this.name);
    const ts = this.isTypeScript();
    const ext = this.ext();
    const depth = paths.namespaceParts.length > 1 ? paths.namespaceParts.length - 1 : 0;

    const source = emitControllerClass({
      className: paths.className,
      parent: parentRefForRelative(parent, depth, this.ext()),
      methods: actions.map((a) => actionMethod(a, ts)),
    });
    this.createFile(`app/controllers/${paths.controllerFile}${ext}`, source);
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
  removePossibleSuffix(name: string): string {
    return name.replace(/_?controller$/i, "");
  }
}

Object.defineProperty(ControllerGenerator, "name", {
  value: "Rails::Generators::ControllerGenerator",
});
ControllerGenerator.argument("actions", { type: "array", default: [], banner: "action action" });
ControllerGenerator.classOption("skipRoutes", {
  type: "boolean",
  desc: "Don't add routes to config/routes.rb.",
});
ControllerGenerator.classOption("helper", { type: "boolean" });
ControllerGenerator.classOption("parent", {
  type: "string",
  default: "ApplicationController",
  desc: "The parent class for the generated controller",
});
ControllerGenerator.checkClassCollision({ suffix: "Controller" });
ControllerGenerator.methodAdded("createControllerFiles");
ControllerGenerator.methodAdded("addRoutes");
ControllerGenerator.hookFor(
  "templateEngine",
  "testFramework",
  "helper",
  function (this: GeneratorBase, generator: GeneratorClass) {
    const self = this as ControllerGenerator;
    return this.invoke(generator, [self.removePossibleSuffix(self.name), self.actions]);
  },
);
