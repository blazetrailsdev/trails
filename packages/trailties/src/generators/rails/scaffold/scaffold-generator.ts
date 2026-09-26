/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ResourceHelpers` (`resource_generator.rb:9`, inherited by `scaffold_generator.rb:7`); the class/interface merge is how a mixin surfaces on the type side. */
import { humanize, include, pluralize, type Included } from "@blazetrails/activesupport";
import { dasherize, parseColumns } from "../../base.js";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import type { ModelHelpersOptions } from "../../model-helpers.js";
import { ResourceHelpers } from "../../resource-helpers.js";
import { ModelGenerator } from "../../model-generator.js";
import { tsBody, tsMethod, type Method } from "../../../template-builder/index.js";
import { emitControllerClass } from "../controller/controller-paths.js";
import { emitResourceRouteSnippet } from "../resource-route/resource-route-generator.js";

export interface ScaffoldGeneratorOptions extends NamedBaseOptions, ModelHelpersOptions {
  modelName?: string;
}

export interface ScaffoldGenerator extends Included<typeof ResourceHelpers> {}

export class ScaffoldGenerator extends NamedBase {
  declare controllerName: string;
  declare controllerFileName: string;
  declare _controllerClassPath: string[];

  run(): string[] {
    const args = (this.options as ScaffoldGeneratorOptions).attributes ?? [];
    const className = this.className().split("::").join("");
    const singular = this.singularTableName();
    const plural = this.pluralTableName();
    const viewsPath = `app/views/${this.controllerFilePath()}`;
    const columns = parseColumns(args);

    const modelGen = new ModelGenerator({
      cwd: this.cwd,
      output: this.output,
      behavior: this.behavior,
    });
    this.createdFiles.push(...modelGen.run(this.name, args));

    const controllerClassName = this.controllerClassName().split("::").join("") + "Controller";
    const controllerFileName = dasherize(this.controllerFilePath()) + "-controller";
    const ext = this.ext();
    const ts = this.isTypeScript();

    this.createFile(
      `app/controllers/${controllerFileName}${ext}`,
      emitControllerClass({
        className: controllerClassName,
        methods: crudMethods(className, singular, plural, this.routeUrl(), ts),
      }),
    );
    this.createFile(
      `test/controllers/${controllerFileName}.test${ext}`,
      controllerTestSource(controllerClassName, controllerFileName),
    );

    this.createFile(`${viewsPath}/index.html.tse`, indexView(plural, singular, columns));
    this.createFile(`${viewsPath}/show.html.tse`, showView(singular, columns));
    this.createFile(`${viewsPath}/new.html.tse`, newView(singular, plural));
    this.createFile(`${viewsPath}/edit.html.tse`, editView(singular, plural));
    this.createFile(`${viewsPath}/_form.html.tse`, formPartial(singular, columns));
    if (!this.fileExists("app/views/layouts/application.html.tse")) {
      this.createFile("app/views/layouts/application.html.tse", layoutTemplate());
    }

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

type Col = { name: string; type: string };

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
      `// const ${plural} = await ${model}.all();\nconst ${plural}${anyArr} = [];\nthis.render({ action: "index", locals: { ${plural} } });`,
    ),
    mk(
      "show",
      `// const ${singular} = await ${model}.find(this.params.get("id"));\nconst ${singular} = { id: this.params.get("id") };\nthis.render({ action: "show", locals: { ${singular} } });`,
    ),
    mk("new_", `const ${singular} = {};\nthis.render({ action: "new", locals: { ${singular} } });`),
    mk(
      "create",
      `// const ${singular} = await ${model}.create(this.params.get("${singular}"));\nthis.redirectTo("${routeUrl}");`,
    ),
    mk(
      "edit",
      `// const ${singular} = await ${model}.find(this.params.get("id"));\nconst ${singular} = { id: this.params.get("id") };\nthis.render({ action: "edit", locals: { ${singular} } });`,
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

function indexView(plural: string, singular: string, cols: Col[]): string {
  const heads = cols.map((c) => `        <th>${humanize(c.name)}</th>`).join("\n");
  const cells = cols.map((c) => `          <td><%= ${singular}.${c.name} %></td>`).join("\n");
  return `<h1>${pluralize(humanize(singular))}</h1>

<p><a href="/${plural}/new">New ${humanize(singular).toLowerCase()}</a></p>

<table>
  <thead>
    <tr>
${heads}
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    <% for (const ${singular} of ${plural}) { %>
      <tr>
${cells}
        <td>
          <a href="/${plural}/<%= ${singular}.id %>">Show</a>
          <a href="/${plural}/<%= ${singular}.id %>/edit">Edit</a>
        </td>
      </tr>
    <% } %>
  </tbody>
</table>
`;
}

function showView(singular: string, cols: Col[]): string {
  const fields = cols
    .map((c) => `<p><strong>${humanize(c.name)}:</strong> <%= ${singular}.${c.name} %></p>`)
    .join("\n");
  return `<h1>${humanize(singular)}</h1>

${fields}

<p>
  <a href="/<%= controller_name %>/<%= ${singular}.id %>/edit">Edit</a>
  |
  <a href="/<%= controller_name %>">Back</a>
</p>
`;
}

function newView(singular: string, plural: string): string {
  return `<h1>New ${humanize(singular).toLowerCase()}</h1>

<%= yield %>

<p><a href="/${plural}">Back</a></p>
`;
}

function editView(singular: string, plural: string): string {
  return `<h1>Editing ${humanize(singular).toLowerCase()}</h1>

<%= yield %>

<p>
  <a href="/${plural}/<%= ${singular}.id %>">Show</a>
  |
  <a href="/${plural}">Back</a>
</p>
`;
}

function formPartial(singular: string, cols: Col[]): string {
  const fields = cols
    .filter((c) => c.type !== "references")
    .map((c) => {
      const inputType =
        c.type === "boolean"
          ? "checkbox"
          : c.type === "integer" || c.type === "float" || c.type === "decimal"
            ? "number"
            : c.type === "text"
              ? "textarea"
              : c.type === "date"
                ? "date"
                : c.type === "datetime" || c.type === "timestamp"
                  ? "datetime-local"
                  : "text";
      if (inputType === "textarea") {
        return `  <div>
    <label for="${singular}_${c.name}">${humanize(c.name)}</label>
    <textarea name="${singular}[${c.name}]" id="${singular}_${c.name}"><%= ${singular}.${c.name} ?? "" %></textarea>
  </div>`;
      }
      return `  <div>
    <label for="${singular}_${c.name}">${humanize(c.name)}</label>
    <input type="${inputType}" name="${singular}[${c.name}]" id="${singular}_${c.name}" value="<%= ${singular}.${c.name} ?? "" %>">
  </div>`;
    })
    .join("\n\n");
  return `<form method="post">
${fields}

  <div>
    <input type="submit" value="Save ${humanize(singular)}">
  </div>
</form>
`;
}

function layoutTemplate(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Trails</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      color: #333;
    }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background: #f5f5f5; }
    a { color: #0366d6; }
    input, textarea, select { padding: 0.4rem; margin: 0.25rem 0; }
    label { display: block; font-weight: bold; margin-top: 0.5rem; }
    h1 { border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
  </style>
</head>
<body>
  <%= yield %>
</body>
</html>
`;
}
