import { camelize, pluralize } from "@blazetrails/activesupport";
import type { ScaffoldGenerator } from "./scaffold-generator.js";

export const TEMPLATES: Record<string, (this: ScaffoldGenerator) => string> = {
  "edit.html.tse": function () {
    return `<% contentFor("title", "Editing ${this.humanName().toLowerCase()}") %>

<h1>Editing ${this.humanName().toLowerCase()}</h1>

<%= render("form", { ${this.singularTableName()}: this.${this.singularTableName()} }) %>

<br>

<div>
  <%= linkTo("Show this ${this.humanName().toLowerCase()}", ${this.modelResourceName(undefined, { prefix: "this." })}) %> |
  <%= linkTo("Back to ${pluralize(this.humanName()).toLowerCase()}", ${this.indexHelper({ type: "path" })}()) %>
</div>
`;
  },

  "_form.html.tse": function () {
    const singularTableName = this.singularTableName();
    return `<%= formWith({ model: ${this.modelResourceName()} }, (form) => { %>
  <% if (${singularTableName}.errors.isAny()) { %>
    <div style="color: red">
      <h2><%= pluralize(${singularTableName}.errors.count, "error") %> prohibited this ${singularTableName} from being saved:</h2>

      <ul>
        <% ${singularTableName}.errors.each((error) => { %>
          <li><%= error.fullMessage %></li>
        <% }) %>
      </ul>
    </div>
  <% } %>

${this.attributes
  .map((attribute) => {
    let body: string;
    if (attribute.passwordDigest()) {
      body = `    <%= form.label("password", { style: "display: block" }) %>
    <%= form.passwordField("password") %>
  </div>

  <div>
    <%= form.label("password_confirmation", { style: "display: block" }) %>
    <%= form.passwordField("password_confirmation") %>
`;
    } else if (attribute.attachments()) {
      body = `    <%= form.label("${attribute.columnName()}", { style: "display: block" }) %>
    <%= form.${camelize(attribute.fieldType(), "lower")}("${attribute.columnName()}", { multiple: true }) %>
`;
    } else {
      body = `    <%= form.label("${attribute.columnName()}", { style: "display: block" }) %>
    <%= form.${camelize(attribute.fieldType(), "lower")}("${attribute.columnName()}") %>
`;
    }
    return `  <div>
${body}  </div>

`;
  })
  .join("")}  <div>
    <%= form.submit() %>
  </div>
<% }) %>
`;
  },

  "index.html.tse": function () {
    const singularTableName = this.singularTableName();
    return `<p style="color: green"><%= notice %></p>

<% contentFor("title", "${pluralize(this.humanName())}") %>

<h1>${pluralize(this.humanName())}</h1>

<div id="${this.pluralTableName()}">
  <% for (const ${singularTableName} of this.${this.pluralTableName()}) { %>
    <%= render(${singularTableName}) %>
    <p>
      <%= linkTo("Show this ${this.humanName().toLowerCase()}", ${this.modelResourceName(singularTableName)}) %>
    </p>
  <% } %>
</div>

<%= linkTo("New ${this.humanName().toLowerCase()}", ${this.newHelper({ type: "path" })}()) %>
`;
  },

  "new.html.tse": function () {
    return `<% contentFor("title", "New ${this.humanName().toLowerCase()}") %>

<h1>New ${this.humanName().toLowerCase()}</h1>

<%= render("form", { ${this.singularTableName()}: this.${this.singularTableName()} }) %>

<br>

<div>
  <%= linkTo("Back to ${pluralize(this.humanName()).toLowerCase()}", ${this.indexHelper({ type: "path" })}()) %>
</div>
`;
  },

  "partial.html.tse": function () {
    const singularName = this.singularName();
    return `<div id="<%= domId(${singularName}) %>">
${this.attributes
  .filter((attribute) => !attribute.passwordDigest())
  .map((attribute) => {
    let body: string;
    if (attribute.attachment()) {
      body = `    <%= ${singularName}.${attribute.columnName()}.isAttached() ? linkTo(${singularName}.${attribute.columnName()}.filename, ${singularName}.${attribute.columnName()}) : null %>
`;
    } else if (attribute.attachments()) {
      body = `    <% for (const ${attribute.singularName()} of ${singularName}.${attribute.columnName()}) { %>
      <div><%= linkTo(${attribute.singularName()}.filename, ${attribute.singularName()}) %></div>
    <% } %>
`;
    } else {
      body = `    <%= ${singularName}.${attribute.columnName()} %>
`;
    }
    return `  <p>
    <strong>${attribute.humanName()}:</strong>
${body}  </p>

`;
  })
  .join("")}</div>
`;
  },

  "show.html.tse": function () {
    return `<p style="color: green"><%= notice %></p>

<%= render(this.${this.singularTableName()}) %>

<div>
  <%= linkTo("Edit this ${this.humanName().toLowerCase()}", ${this.editHelper(undefined, { type: "path" })}) %> |
  <%= linkTo("Back to ${pluralize(this.humanName()).toLowerCase()}", ${this.indexHelper({ type: "path" })}()) %>

  <%= buttonTo("Destroy this ${this.humanName().toLowerCase()}", ${this.modelResourceName(undefined, { prefix: "this." })}, { method: "delete" }) %>
</div>
`;
  },
};
