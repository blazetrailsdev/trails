/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ResourceHelpers` (`scaffold_controller_generator.rb:8`); the class/interface merge is how a mixin surfaces on the type side. */
import { camelize, include, type Included } from "@blazetrails/activesupport";
import { dasherize, parseColumns } from "../../base.js";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import type { ModelHelpersOptions } from "../../model-helpers.js";
import { ResourceHelpers } from "../../resource-helpers.js";
import type { ActiveModel } from "../../active-model.js";
import { tsBody, tsMethod, type Method } from "../../../template-builder/index.js";
import { emitControllerClass, parentRefForRelative } from "../controller/controller-paths.js";
import { emitResourceRouteSnippet } from "../resource-route/resource-route-generator.js";

export interface ScaffoldControllerGeneratorOptions extends NamedBaseOptions, ModelHelpersOptions {
  api?: boolean;
  skipRoutes?: boolean;
  test?: boolean;
  helper?: boolean;
  modelName?: string;
  orm?: string | false;
}

export interface ScaffoldControllerGenerator extends Included<typeof ResourceHelpers> {}

export class ScaffoldControllerGenerator extends NamedBase {
  /** @internal */
  declare controllerName: string;
  /** @internal */
  declare controllerFileName: string;
  /** @internal */
  declare _controllerClassPath: string[];
  declare options: ScaffoldControllerGeneratorOptions;

  constructor(options: ScaffoldControllerGeneratorOptions) {
    super({ ...options, name: options.name.replace(/[_-]?controller$/i, "") });
  }

  run(): string[] {
    const { api = false, skipRoutes = false, test = true, helper = true } = this.options;
    const modelClassName = this.className().split("::").join("");
    const singular = this.singularTableName();
    const controllerClassName = this.controllerClassName().split("::").join("") + "Controller";
    const controllerFileName = dasherize(this.controllerFilePath()) + "-controller";
    const routeUrl = this.routeUrl();
    const ext = this.ext();
    const ts = this.isTypeScript();
    const attrNames = parseColumns(this.options.attributes ?? []).map((c) => c.name);
    const modelPath = "../".repeat(this.controllerClassPath().length + 1) + "models/";

    this.createFile(
      `app/controllers/${controllerFileName}${ext}`,
      emitControllerClass({
        className: controllerClassName,
        parent: parentRefForRelative("ApplicationController", this.controllerClassPath().length),
        imports: [
          { from: `${modelPath}${this.filePath()}.js`, named: { [modelClassName]: "named" } },
        ],
        methods: api
          ? apiCrudMethods(
              this.ormClass(),
              this.ormInstance(),
              modelClassName,
              singular,
              this.pluralTableName(),
              attrNames,
              ts,
            )
          : crudMethods(
              this.ormClass(),
              this.ormInstance(),
              modelClassName,
              singular,
              this.pluralTableName(),
              routeUrl,
              attrNames,
              ts,
            ),
      }),
    );

    if (test) {
      const skip = (a: string) =>
        api && (a === "new" || a === "edit") ? "" : `  it("${a}", () => {});\n`;
      const importPrefix = "../".repeat(this.controllerClassPath().length + 2);
      this.createFile(
        `test/controllers/${controllerFileName}.test${ext}`,
        `import { describe, it } from "vitest";
import { ${controllerClassName} } from "${importPrefix}app/controllers/${controllerFileName}.js";

describe("${controllerClassName}", () => {
  it("references controller", () => { void ${controllerClassName}; });
${skip("index")}${skip("show")}${skip("new")}${skip("create")}${skip("edit")}${skip("update")}${skip("destroy")}});
`,
      );
    }

    if (helper && !api) {
      const helperFileName = dasherize(this.controllerFilePath()) + "-helper";
      const helperConstName = this.controllerClassName().split("::").join("") + "Helper";
      this.createFile(
        `app/helpers/${helperFileName}${ext}`,
        `export const ${helperConstName} = {\n};\n`,
      );
    }

    if (!skipRoutes) {
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
    }
    return this.getCreatedFiles();
  }
}

include(ScaffoldControllerGenerator, ResourceHelpers);
ScaffoldControllerGenerator.classOption("orm", {
  banner: "NAME",
  type: "string",
  required: true,
  desc: "ORM to generate the controller for",
});

function mk(name: string, body: string, ts: boolean): Method {
  return tsMethod({
    name,
    params: [],
    async: true,
    returnType: ts ? "Promise<void>" : undefined,
    body: tsBody`${body}`,
  });
}

function paramsMethod(singular: string, attrs: string[], ts: boolean): Method {
  const list =
    attrs.length === 0
      ? `return this.params.fetch("${singular}", {});`
      : `return this.params.expect({ ${singular}: [${attrs.map((a) => `"${a}"`).join(", ")}] });`;
  return tsMethod({
    name: `${camelize(singular, false)}Params`,
    params: [],
    returnType: ts ? "unknown" : undefined,
    body: tsBody`${list}`,
  });
}

function crudMethods(
  ormClass: typeof ActiveModel,
  ormInstance: ActiveModel,
  model: string,
  singular: string,
  plural: string,
  routeUrl: string,
  attrs: string[],
  ts: boolean,
): Method[] {
  const params = `this.${camelize(singular, false)}Params()`;
  const find = `const ${singular} = await ${ormClass.find(model, 'this.params.expect("id")')};`;
  return [
    mk(
      "index",
      `const ${plural} = await ${ormClass.all(model)};\nawait this.render({ action: "index", locals: { ${plural} } });`,
      ts,
    ),
    mk("show", `${find}\nawait this.render({ action: "show", locals: { ${singular} } });`, ts),
    mk(
      "new_",
      `const ${singular} = ${ormClass.build(model)};\nawait this.render({ action: "new", locals: { ${singular} } });`,
      ts,
    ),
    mk(
      "create",
      `const ${singular} = ${ormClass.build(model, params)};\n\nif (await ${ormInstance.save()}) {\n  this.redirectTo(\`${routeUrl}/\${${singular}.id}\`);\n} else {\n  await this.render({ action: "new", status: "unprocessable_entity", locals: { ${singular} } });\n}`,
      ts,
    ),
    mk("edit", `${find}\nawait this.render({ action: "edit", locals: { ${singular} } });`, ts),
    mk(
      "update",
      `${find}\nif (await ${ormInstance.update(params)}) {\n  this.redirectTo(\`${routeUrl}/\${${singular}.id}\`, { status: "see_other" });\n} else {\n  await this.render({ action: "edit", status: "unprocessable_entity", locals: { ${singular} } });\n}`,
      ts,
    ),
    mk(
      "destroy",
      `${find}\nawait ${ormInstance.destroy()};\nthis.redirectTo("${routeUrl}", { status: "see_other" });`,
      ts,
    ),
    paramsMethod(singular, attrs, ts),
  ];
}

function apiCrudMethods(
  ormClass: typeof ActiveModel,
  ormInstance: ActiveModel,
  model: string,
  singular: string,
  plural: string,
  attrs: string[],
  ts: boolean,
): Method[] {
  const params = `this.${camelize(singular, false)}Params()`;
  const find = `const ${singular} = await ${ormClass.find(model, 'this.params.expect("id")')};`;
  return [
    mk(
      "index",
      `const ${plural} = await ${ormClass.all(model)};\n\nthis.renderJson(${plural});`,
      ts,
    ),
    mk("show", `${find}\nthis.renderJson(${singular});`, ts),
    mk(
      "create",
      `const ${singular} = ${ormClass.build(model, params)};\n\nif (await ${ormInstance.save()}) {\n  this.renderJson(${singular}, { status: 201 });\n} else {\n  this.renderJson(${ormInstance.errors()}, { status: 422 });\n}`,
      ts,
    ),
    mk(
      "update",
      `${find}\nif (await ${ormInstance.update(params)}) {\n  this.renderJson(${singular});\n} else {\n  this.renderJson(${ormInstance.errors()}, { status: 422 });\n}`,
      ts,
    ),
    mk("destroy", `${find}\nawait ${ormInstance.destroy()};`, ts),
    paramsMethod(singular, attrs, ts),
  ];
}
