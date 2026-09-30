import type { ModelGenerator } from "./model-generator.js";

type Template = (this: ModelGenerator) => string;

/** @missingRailsCall module_namespacing — CONVERGEABLE scaffold-controller-hooks-test-framework-and-engine-arms */
const unitTest: Template = function () {
  const className = this.className().split("::").join("");
  const root = "../".repeat(this.classPathParts.length + 1);
  return `import { describe, it } from "vitest";
import "${root}test-helper.js";

describe("${className}Test", () => {
  it.todo("the truth");
});
`;
};

const fixtures: Template = function () {
  let out =
    "# Read about fixtures at https://api.rubyonrails.org/classes/ActiveRecord/FixtureSet.html\n";
  if (this.attributes.length > 0) {
    for (const name of ["one", "two"]) {
      out += `\n${name}:\n`;
      for (const attribute of this.attributes) {
        if (attribute.passwordDigest()) {
          out += `  password_digest: <%= BCrypt.Password.create("secret") %>\n`;
        } else if (attribute.reference()) {
          const d = attribute.default();
          out += `  ${this.yamlKeyValue(attribute.columnName().replace(/_id$/, ""), d != null && d !== false ? d : name)}\n`;
        } else if (!attribute.virtual()) {
          out += `  ${this.yamlKeyValue(attribute.columnName(), attribute.default())}\n`;
        }
        if (attribute.polymorphic()) {
          out += `  ${this.yamlKeyValue(`${attribute.name}_type`, attribute.humanName())}\n`;
        }
      }
    }
  } else {
    out += `
# This model initially had no columns defined. If you add columns to the
# model remove the "{}" from the fixture names and add the columns immediately
# below each fixture, per the syntax in the comments below
#
one: {}
# column: value
#
two: {}
# column: value
`;
  }
  return out;
};

export const TEMPLATES: Record<"unit_test" | "fixtures", Template> = {
  unit_test: unitTest,
  fixtures,
};
