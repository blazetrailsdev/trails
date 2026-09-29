/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ResourceHelpers` (`scaffold_controller_generator.rb:8`); the class/interface merge is how a mixin surfaces on the type side. */
import { camelize, include, type Included } from "@blazetrails/activesupport";
import { dasherize, parseColumns, type GeneratorBase } from "../../base.js";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import type { ModelHelpersOptions } from "../../model-helpers.js";
import { ResourceHelpers } from "../../resource-helpers.js";
import type { GeneratorClass } from "../../../generators.js";
import { tsBody, tsField, tsMethod, type Method } from "../../../template-builder/index.js";
import { emitControllerClass, parentRefForRelative } from "../controller/controller-paths.js";
import * as Tse from "../../tse/scaffold/scaffold-generator.js";

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

  async run(): Promise<string[]> {
    const { api, test = true, helper } = this.options;
    const modelClassName = this.className().split("::").join("");
    const singular = this.singularTableName();
    const controllerClassName = this.controllerClassName().split("::").join("") + "Controller";
    const controllerFileName = dasherize(this.controllerFilePath()) + "-controller";
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
        staticBlock: api
          ? tsBody`this.beforeAction("set${camelize(singular)}", { only: ["show", "update", "destroy"] });`
          : tsBody`this.beforeAction("set${camelize(singular)}", { only: ["show", "edit", "update", "destroy"] });`,
        fields: ts
          ? [
              tsField(this.pluralTableName(), `${modelClassName}[]`, { declare: true }),
              tsField(singular, modelClassName, { declare: true }),
            ]
          : [],
        methods: api
          ? apiCrudMethods.call(this, modelClassName, attrNames, ts)
          : crudMethods.call(this, modelClassName, attrNames, ts),
      }),
    );

    if (!api) {
      this.createdFiles.push(
        ...new Tse.ScaffoldGenerator({ ...this.options, behavior: this.behavior }).run(),
      );
    }

    if (test) await this.invoke("test_unit:scaffold");

    if (helper && !api) {
      const helperFileName = dasherize(this.controllerFilePath()) + "-helper";
      const helperConstName = this.controllerClassName().split("::").join("") + "Helper";
      this.createFile(
        `app/helpers/${helperFileName}${ext}`,
        `export const ${helperConstName} = {\n};\n`,
      );
    }

    return this.getCreatedFiles();
  }
}

Object.defineProperty(ScaffoldControllerGenerator, "name", {
  value: "Rails::Generators::ScaffoldControllerGenerator",
});
include(ScaffoldControllerGenerator, ResourceHelpers);
ScaffoldControllerGenerator.checkClassCollision({ suffix: "Controller" });
ScaffoldControllerGenerator.classOption("helper", { type: "boolean" });
ScaffoldControllerGenerator.classOption("orm", {
  banner: "NAME",
  type: "string",
  required: true,
  desc: "ORM to generate the controller for",
});
ScaffoldControllerGenerator.classOption("api", {
  type: "boolean",
  desc: "Generate API controller",
});
ScaffoldControllerGenerator.classOption("skipRoutes", {
  type: "boolean",
  desc: "Don't add routes to config/routes.rb.",
});
ScaffoldControllerGenerator.hookFor(
  "resourceRoute",
  { required: true },
  function (this: GeneratorBase, route: GeneratorClass) {
    if (!(this.options as ScaffoldControllerGeneratorOptions).skipRoutes) return this.invoke(route);
  },
);

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
  const returnType = "Record<string, unknown>";
  const cast = ts ? ` as ${returnType}` : "";
  const list =
    attrs.length === 0
      ? `return this.params.fetch("${singular}", {})${cast};`
      : `return this.params.expect({ ${singular}: [${attrs.map((a) => `"${a}"`).join(", ")}] })${cast};`;
  return tsMethod({
    name: `${camelize(singular, false)}Params`,
    visibility: "private",
    params: [],
    returnType: ts ? returnType : undefined,
    body: tsBody`${list}`,
  });
}

function crudMethods(
  this: ScaffoldControllerGenerator,
  model: string,
  attrs: string[],
  ts: boolean,
): Method[] {
  const ormClass = this.ormClass();
  const ormInstance = this.ormInstance();
  const singular = this.singularTableName();
  const humanName = this.humanName();
  const params = `this.${camelize(singular, false)}Params()`;
  return [
    mk("index", `this.${this.pluralTableName()} = await ${ormClass.all(model)};`, ts),
    mk("show", "", ts),
    mk("new", `this.${singular} = ${ormClass.build(model)};`, ts),
    mk("edit", "", ts),
    mk(
      "create",
      `this.${singular} = ${ormClass.build(model, params)};\n\nif (await this.${ormInstance.save()}) {\n  this.redirectTo(${this.redirectResourceName()}, { notice: "${humanName} was successfully created." });\n} else {\n  await this.render({ action: "new", status: "unprocessable_entity" });\n}`,
      ts,
    ),
    mk(
      "update",
      `if (await this.${ormInstance.update(params)}) {\n  this.redirectTo(${this.redirectResourceName()}, { notice: "${humanName} was successfully updated.", status: "see_other" });\n} else {\n  await this.render({ action: "edit", status: "unprocessable_entity" });\n}`,
      ts,
    ),
    mk(
      "destroy",
      `await this.${ormInstance.destroy()};\nthis.redirectTo(this.${this.indexHelper()}Path(), { notice: "${humanName} was successfully destroyed.", status: "see_other" });`,
      ts,
    ),
    {
      ...mk(
        `set${camelize(singular)}`,
        `this.${singular} = await ${ormClass.find(model, 'this.params.expect("id")')};`,
        ts,
      ),
      visibility: "private",
    },
    paramsMethod(singular, attrs, ts),
  ];
}

function apiCrudMethods(
  this: ScaffoldControllerGenerator,
  model: string,
  attrs: string[],
  ts: boolean,
): Method[] {
  const ormClass = this.ormClass();
  const ormInstance = this.ormInstance();
  const singular = this.singularTableName();
  const plural = this.pluralTableName();
  const params = `this.${camelize(singular, false)}Params()`;
  return [
    mk(
      "index",
      `this.${plural} = await ${ormClass.all(model)};\n\nawait this.render({ json: this.${plural} });`,
      ts,
    ),
    mk("show", `await this.render({ json: this.${singular} });`, ts),
    mk(
      "create",
      `this.${singular} = ${ormClass.build(model, params)};\n\nif (await this.${ormInstance.save()}) {\n  await this.render({ json: this.${singular}, status: "created", location: this.${singular} });\n} else {\n  await this.render({ json: this.${ormInstance.errors()}, status: "unprocessable_entity" });\n}`,
      ts,
    ),
    mk(
      "update",
      `if (await this.${ormInstance.update(params)}) {\n  await this.render({ json: this.${singular} });\n} else {\n  await this.render({ json: this.${ormInstance.errors()}, status: "unprocessable_entity" });\n}`,
      ts,
    ),
    mk("destroy", `await this.${ormInstance.destroy()};`, ts),
    {
      ...mk(
        `set${camelize(singular)}`,
        `this.${singular} = await ${ormClass.find(model, 'this.params.expect("id")')};`,
        ts,
      ),
      visibility: "private",
    },
    paramsMethod(singular, attrs, ts),
  ];
}
