import { GeneratorBase, GeneratorOptions, classify, dasherize, tableize, parseColumns, underscore } from "./base.js";
import { ModelGenerator } from "./model-generator.js";

export class ScaffoldGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  run(name: string, args: string[]): string[] {
    const className = classify(name);
    const resourceName = tableize(className);
    const singular = underscore(className);
    const columns = parseColumns(args);

    // Generate model + migration
    const modelGen = new ModelGenerator({ cwd: this.cwd, output: this.output });
    const modelFiles = modelGen.run(name, args);
    this.createdFiles.push(...modelFiles);

    // Generate controller with CRUD actions and rendering
    const controllerClassName = classify(resourceName) + "Controller";
    const controllerFileName = dasherize(resourceName) + "-controller";

    this.createFile(`src/app/controllers/${controllerFileName}.ts`, this.controllerSource(
      controllerClassName, className, singular, resourceName
    ));

    // Controller test
    this.createFile(`test/controllers/${controllerFileName}.test.ts`, this.controllerTestSource(
      controllerClassName, controllerFileName
    ));

    // EJS view templates
    this.createFile(`src/app/views/${resourceName}/index.html.ejs`, this.indexView(resourceName, singular, columns));
    this.createFile(`src/app/views/${resourceName}/show.html.ejs`, this.showView(singular, columns));
    this.createFile(`src/app/views/${resourceName}/new.html.ejs`, this.newView(singular, resourceName, columns));
    this.createFile(`src/app/views/${resourceName}/edit.html.ejs`, this.editView(singular, resourceName, columns));
    this.createFile(`src/app/views/${resourceName}/_form.html.ejs`, this.formPartial(singular, columns));

    // Create layout if it doesn't exist
    if (!this.fileExists("src/app/views/layouts/application.html.ejs")) {
      this.createFile("src/app/views/layouts/application.html.ejs", this.layoutTemplate());
    }

    // Add RESTful routes
    if (this.fileExists("src/config/routes.ts")) {
      this.insertIntoFile(
        "src/config/routes.ts",
        "// routes",
        `  router.resources("${resourceName}");\n`,
      );
    }

    return this.getCreatedFiles();
  }

  private controllerSource(
    controllerClassName: string,
    modelClassName: string,
    singular: string,
    plural: string,
  ): string {
    return `import { ActionController } from "@rails-ts/actionpack";

export class ${controllerClassName} extends ActionController.Base {
  async index(): Promise<void> {
    // const ${plural} = await ${modelClassName}.all();
    const ${plural}: any[] = [];
    this.render({ action: "index", locals: { ${plural} } });
  }

  async show(): Promise<void> {
    // const ${singular} = await ${modelClassName}.find(this.params.get("id"));
    const ${singular} = { id: this.params.get("id") };
    this.render({ action: "show", locals: { ${singular} } });
  }

  async new_(): Promise<void> {
    const ${singular} = {};
    this.render({ action: "new", locals: { ${singular} } });
  }

  async create(): Promise<void> {
    // const ${singular} = await ${modelClassName}.create(this.params.get("${singular}"));
    this.redirectTo("/${plural}");
  }

  async edit(): Promise<void> {
    // const ${singular} = await ${modelClassName}.find(this.params.get("id"));
    const ${singular} = { id: this.params.get("id") };
    this.render({ action: "edit", locals: { ${singular} } });
  }

  async update(): Promise<void> {
    // const ${singular} = await ${modelClassName}.find(this.params.get("id"));
    // await ${singular}.update(this.params.get("${singular}"));
    this.redirectTo("/${plural}/" + this.params.get("id"));
  }

  async destroy(): Promise<void> {
    // const ${singular} = await ${modelClassName}.find(this.params.get("id"));
    // await ${singular}.destroy();
    this.redirectTo("/${plural}");
  }
}
`;
  }

  private controllerTestSource(className: string, fileName: string): string {
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

  private indexView(plural: string, singular: string, columns: Array<{ name: string; type: string }>): string {
    const tableHeaders = columns.map((c) => `        <th>${classify(c.name)}</th>`).join("\n");
    const tableCells = columns.map((c) => `          <td><%= ${singular}.${c.name} %></td>`).join("\n");

    return `<h1>${classify(plural)}</h1>

<p><a href="/${plural}/new">New ${classify(singular)}</a></p>

<table>
  <thead>
    <tr>
${tableHeaders}
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    <% for (const ${singular} of ${plural}) { %>
      <tr>
${tableCells}
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

  private showView(singular: string, columns: Array<{ name: string; type: string }>): string {
    const fields = columns.map((c) =>
      `<p><strong>${classify(c.name)}:</strong> <%= ${singular}.${c.name} %></p>`
    ).join("\n");

    return `<h1>${classify(singular)}</h1>

${fields}

<p>
  <a href="/<%= controller_name %>/<%= ${singular}.id %>/edit">Edit</a>
  |
  <a href="/<%= controller_name %>">Back</a>
</p>
`;
  }

  private newView(singular: string, plural: string, columns: Array<{ name: string; type: string }>): string {
    return `<h1>New ${classify(singular)}</h1>

<%- yield %>

<p><a href="/${plural}">Back</a></p>
`;
  }

  private editView(singular: string, plural: string, columns: Array<{ name: string; type: string }>): string {
    return `<h1>Edit ${classify(singular)}</h1>

<%- yield %>

<p>
  <a href="/${plural}/<%= ${singular}.id %>">Show</a>
  |
  <a href="/${plural}">Back</a>
</p>
`;
  }

  private formPartial(singular: string, columns: Array<{ name: string; type: string }>): string {
    const fields = columns
      .filter((c) => c.type !== "references")
      .map((c) => {
        const inputType = c.type === "boolean" ? "checkbox"
          : c.type === "integer" || c.type === "float" || c.type === "decimal" ? "number"
          : c.type === "text" ? "textarea"
          : c.type === "date" ? "date"
          : c.type === "datetime" || c.type === "timestamp" ? "datetime-local"
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

  private layoutTemplate(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>Rails-TS</title>
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
}
