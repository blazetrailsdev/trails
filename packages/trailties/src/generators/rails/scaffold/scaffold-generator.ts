import {
  GeneratorBase,
  type GeneratorOptions,
  classify,
  dasherize,
  parseColumns,
  tableize,
  underscore,
} from "../../base.js";
import { ModelGenerator } from "../../model-generator.js";
import { tsBody, tsMethod, type Method } from "../../../template-builder/index.js";
import { emitControllerClass } from "../controller/controller-paths.js";

// Mirrors railties/lib/rails/generators/rails/scaffold/scaffold_generator.rb.
export class ScaffoldGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  run(name: string, args: string[]): string[] {
    const className = classify(name);
    const resourceName = tableize(className);
    const singular = underscore(className);
    const columns = parseColumns(args);

    const modelGen = new ModelGenerator({ cwd: this.cwd, output: this.output });
    this.createdFiles.push(...modelGen.run(name, args));

    const controllerClassName = classify(resourceName) + "Controller";
    const controllerFileName = dasherize(resourceName) + "-controller";
    const ext = this.ext();
    const ts = this.isTypeScript();

    this.createFile(
      `src/app/controllers/${controllerFileName}${ext}`,
      emitControllerClass({
        className: controllerClassName,
        methods: crudMethods(className, singular, resourceName, ts),
      }),
    );
    this.createFile(
      `test/controllers/${controllerFileName}.test${ext}`,
      controllerTestSource(controllerClassName, controllerFileName),
    );

    this.createFile(
      `src/app/views/${resourceName}/index.html.tse`,
      indexView(resourceName, singular, columns),
    );
    this.createFile(`src/app/views/${resourceName}/show.html.tse`, showView(singular, columns));
    this.createFile(`src/app/views/${resourceName}/new.html.tse`, newView(singular, resourceName));
    this.createFile(
      `src/app/views/${resourceName}/edit.html.tse`,
      editView(singular, resourceName),
    );
    this.createFile(`src/app/views/${resourceName}/_form.html.tse`, formPartial(singular, columns));
    if (!this.fileExists("src/app/views/layouts/application.html.tse")) {
      this.createFile("src/app/views/layouts/application.html.tse", layoutTemplate());
    }

    const routesFile = this.fileExists("src/config/routes.ts")
      ? "src/config/routes.ts"
      : this.fileExists("src/config/routes.js")
        ? "src/config/routes.js"
        : null;
    if (routesFile) {
      this.insertIntoFile(routesFile, "// routes", `  router.resources("${resourceName}");\n`);
    }
    return this.getCreatedFiles();
  }
}

type Col = { name: string; type: string };

function crudMethods(model: string, singular: string, plural: string, ts: boolean): Method[] {
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
      `// const ${singular} = await ${model}.create(this.params.get("${singular}"));\nthis.redirectTo("/${plural}");`,
    ),
    mk(
      "edit",
      `// const ${singular} = await ${model}.find(this.params.get("id"));\nconst ${singular} = { id: this.params.get("id") };\nthis.render({ action: "edit", locals: { ${singular} } });`,
    ),
    mk(
      "update",
      `// const ${singular} = await ${model}.find(this.params.get("id"));\n// await ${singular}.update(this.params.get("${singular}"));\nthis.redirectTo("/${plural}/" + this.params.get("id"));`,
    ),
    mk(
      "destroy",
      `// const ${singular} = await ${model}.find(this.params.get("id"));\n// await ${singular}.destroy();\nthis.redirectTo("/${plural}");`,
    ),
  ];
}

function controllerTestSource(className: string, fileName: string): string {
  return `import { describe, it, expect } from "vitest";
import { ${className} } from "../../src/app/controllers/${fileName}.js";

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
  const heads = cols.map((c) => `        <th>${classify(c.name)}</th>`).join("\n");
  const cells = cols.map((c) => `          <td><%= ${singular}.${c.name} %></td>`).join("\n");
  return `<h1>${classify(plural)}</h1>

<p><a href="/${plural}/new">New ${classify(singular)}</a></p>

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
    .map((c) => `<p><strong>${classify(c.name)}:</strong> <%= ${singular}.${c.name} %></p>`)
    .join("\n");
  return `<h1>${classify(singular)}</h1>

${fields}

<p>
  <a href="/<%= controller_name %>/<%= ${singular}.id %>/edit">Edit</a>
  |
  <a href="/<%= controller_name %>">Back</a>
</p>
`;
}

function newView(singular: string, plural: string): string {
  return `<h1>New ${classify(singular)}</h1>

<%- yield %>

<p><a href="/${plural}">Back</a></p>
`;
}

function editView(singular: string, plural: string): string {
  return `<h1>Edit ${classify(singular)}</h1>

<%- yield %>

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
    <label for="${singular}_${c.name}">${classify(c.name)}</label>
    <textarea name="${singular}[${c.name}]" id="${singular}_${c.name}"><%= ${singular}.${c.name} ?? "" %></textarea>
  </div>`;
      }
      return `  <div>
    <label for="${singular}_${c.name}">${classify(c.name)}</label>
    <input type="${inputType}" name="${singular}[${c.name}]" id="${singular}_${c.name}" value="<%= ${singular}.${c.name} ?? "" %>">
  </div>`;
    })
    .join("\n\n");
  return `<form method="post">
${fields}

  <div>
    <input type="submit" value="Save ${classify(singular)}">
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
  <%- yield %>
</body>
</html>
`;
}
