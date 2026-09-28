/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ResourceHelpers` (`resource_generator.rb:9`, inherited by `scaffold_generator.rb:7`); the class/interface merge is how a mixin surfaces on the type side. */
import { include, type Included } from "@blazetrails/activesupport";
import { dasherize } from "../../base.js";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import type { ModelHelpersOptions } from "../../model-helpers.js";
import { ResourceHelpers } from "../../resource-helpers.js";
import { ModelGenerator } from "../../model-generator.js";
import { tsBody, tsMethod, type Method } from "../../../template-builder/index.js";
import { emitControllerClass, parentRefForRelative } from "../controller/controller-paths.js";
import { emitResourceRouteSnippet } from "../resource-route/resource-route-generator.js";
import * as Tse from "../../tse/scaffold/scaffold-generator.js";

export interface ScaffoldGeneratorOptions extends NamedBaseOptions, ModelHelpersOptions {
  modelName?: string;
}

export interface ScaffoldGenerator extends Included<typeof ResourceHelpers> {}

export class ScaffoldGenerator extends NamedBase {
  declare controllerName: string;
  declare controllerFileName: string;
  declare _controllerClassPath: string[];

  async run(): Promise<string[]> {
    const args = (this.options as ScaffoldGeneratorOptions).attributes ?? [];
    const className = this.className().split("::").join("");
    const singular = this.singularTableName();
    const plural = this.pluralTableName();
    const routeUrl = this.routeUrl();

    const modelGen = new ModelGenerator({
      cwd: this.cwd,
      output: this.output,
      behavior: this.behavior,
      pretend: this.options.pretend,
      force: this.options.force,
      skip: this.options.skip,
    });
    this.createdFiles.push(...(await modelGen.run(this.name, args)));

    const controllerClassName = this.controllerClassName().split("::").join("") + "Controller";
    const controllerFileName = dasherize(this.controllerFilePath()) + "-controller";
    const ext = this.ext();
    const ts = this.isTypeScript();

    this.createFile(
      `app/controllers/${controllerFileName}${ext}`,
      emitControllerClass({
        className: controllerClassName,
        parent: parentRefForRelative("ApplicationController", this.controllerClassPath().length),
        methods: crudMethods(className, singular, plural, routeUrl, ts),
      }),
    );
    this.createFile(
      `test/controllers/${controllerFileName}.test${ext}`,
      controllerTestSource(controllerClassName, controllerFileName),
    );

    this.createdFiles.push(
      ...new Tse.ScaffoldGenerator({
        ...(this.options as ScaffoldGeneratorOptions),
        behavior: this.behavior,
      }).run(),
    );

    const routesFile = this.fileExists("config/routes.ts")
      ? "config/routes.ts"
      : this.fileExists("config/routes.js")
        ? "config/routes.js"
        : null;
    if (routesFile) {
      this.insertIntoFile(
        routesFile,
        "// routes",
        emitResourceRouteSnippet(this.controllerClassPath(), this.controllerFileName),
      );
    }
    return this.getCreatedFiles();
  }
}

include(ScaffoldGenerator, ResourceHelpers);

function crudMethods(
  model: string,
  singular: string,
  plural: string,
  routeUrl: string,
  ts: boolean,
): Method[] {
  const retT = ts ? "Promise<void>" : undefined;
  const anyArr = ts ? ": any[]" : "";
  const mk = (name: string, body: string) =>
    tsMethod({ name, params: [], async: true, returnType: retT, body: tsBody`${body}` });
  return [
    mk(
      "index",
      `// const ${plural} = await ${model}.all();\nconst ${plural}${anyArr} = [];\nawait this.render({ action: "index", locals: { ${plural} } });`,
    ),
    mk(
      "show",
      `// const ${singular} = await ${model}.find(this.params.get("id"));\nconst ${singular} = { id: this.params.get("id") };\nawait this.render({ action: "show", locals: { ${singular} } });`,
    ),
    mk(
      "new_",
      `const ${singular} = {};\nawait this.render({ action: "new", locals: { ${singular} } });`,
    ),
    mk(
      "create",
      `// const ${singular} = await ${model}.create(this.params.get("${singular}"));\nthis.redirectTo("${routeUrl}");`,
    ),
    mk(
      "edit",
      `// const ${singular} = await ${model}.find(this.params.get("id"));\nconst ${singular} = { id: this.params.get("id") };\nawait this.render({ action: "edit", locals: { ${singular} } });`,
    ),
    mk(
      "update",
      `// const ${singular} = await ${model}.find(this.params.get("id"));\n// await ${singular}.update(this.params.get("${singular}"));\nthis.redirectTo("${routeUrl}/" + this.params.get("id"));`,
    ),
    mk(
      "destroy",
      `// const ${singular} = await ${model}.find(this.params.get("id"));\n// await ${singular}.destroy();\nthis.redirectTo("${routeUrl}");`,
    ),
  ];
}

function controllerTestSource(className: string, fileName: string): string {
  return `import { describe, it, expect } from "vitest";
import { ${className} } from "../../app/controllers/${fileName}.js";

describe("${className}", () => {
  it("index", () => {
    // TODO: test index action
  });

  it("show", () => {
    // TODO: test show action
  });

  it("create", () => {
    // TODO: test create action
  });

  it("update", () => {
    // TODO: test update action
  });

  it("destroy", () => {
    // TODO: test destroy action
  });
});
`;
}
