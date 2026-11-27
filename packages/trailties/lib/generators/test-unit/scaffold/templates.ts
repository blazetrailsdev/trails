import { camelize, dasherize, humanize, pluralize } from "@blazetrails/activesupport";
import type { ScaffoldGenerator } from "./scaffold-generator.js";

type Template = (this: ScaffoldGenerator) => string;

function header(this: ScaffoldGenerator) {
  const namespaceDirs = this["isNamespaced"]() ? this["namespaceDirs"]() : [];
  const namespace = namespaceDirs.length > 0 ? this["namespace"]()!.name : "";
  const testClassName = `${this.controllerClassName().split("::").pop()}ControllerTest`;
  const modulePath = [namespace, ...this.controllerClassName().split("::").slice(0, -1)]
    .filter((m) => m !== "")
    .join("::");
  const testPath = [modulePath, testClassName].filter((m) => m !== "").join("::");
  const owner = modulePath === "" ? "TopLevel" : `constGet(Object, "${modulePath}") as object`;
  const modelClassName = this.className().split("::").pop();
  const singular = this.singularTableName();
  const fixtureName = this.fixtureName();
  const root = "../".repeat(namespaceDirs.length + this.controllerClassPath().length + 1);
  const mountable = this["isMountableEngine"]();
  const engineImport = mountable
    ? `import { include } from "@blazetrails/activesupport";
import { ${namespace.split("::")[0]} } from "../${root}lib/${namespaceDirs.join("/")}/engine.js";
`
    : "";
  const engine = mountable
    ? `
    include(this, ${namespace.replaceAll("::", ".")}.Engine.routes().urlHelpers());
`
    : "";
  const preamble = `import { describe, it } from "vitest";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { assertDifference } from "@blazetrails/activesupport/testing/assertions";
import { constGet } from "@blazetrails/ruby-compat/variable";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
${engineImport}import { ${modelClassName} } from "../${root}app/models/${[...namespaceDirs, ...this["classPath"](), dasherize(this.fileName)].join("/")}.js";
import "${root}test-helper.js";

export class ${testClassName} extends IntegrationTest {
  declare "@${singular}": ${modelClassName};

  static {
    constSet(${owner}, "${testClassName}", this);${engine}
    this.setup(async function (this: ${testClassName}) {
      this["@${singular}"] = await this.${fixtureName}("one");
    });
  }
}
`;
  return {
    testPath,
    testClassName,
    modelClassName,
    singular,
    record: `t["@${singular}"]`,
    preamble,
  };
}

const functionalTest: Template = function () {
  const { testPath, testClassName, modelClassName, singular, record, preamble } = header.call(this);
  return `${preamble}
describe("${testPath}", () => {
  it<{ testCase: ${testClassName} }>("should get index", async ({ testCase: t }) => {
    await t.get(t.${this.indexHelper({ type: "url" })}());
    t.assertResponse(":success");
  });

  it<{ testCase: ${testClassName} }>("should get new", async ({ testCase: t }) => {
    await t.get(t.${this.newHelper()}());
    t.assertResponse(":success");
  });

  it<{ testCase: ${testClassName} }>("should create ${singular}", async ({ testCase: t }) => {
    await assertDifference(() => ${modelClassName}.count(), async () => {
      await t.post(t.${this.indexHelper({ type: "url" })}(), { params: { ${singular}: ${this.attributesString()} } });
    });

    t.assertRedirectedTo(t.${this.showHelper(`await ${modelClassName}.last()`)});
  });

  it<{ testCase: ${testClassName} }>("should show ${singular}", async ({ testCase: t }) => {
    await t.get(t.${this.showHelper(record)});
    t.assertResponse(":success");
  });

  it<{ testCase: ${testClassName} }>("should get edit", async ({ testCase: t }) => {
    await t.get(t.${this.editHelper(record)});
    t.assertResponse(":success");
  });

  it<{ testCase: ${testClassName} }>("should update ${singular}", async ({ testCase: t }) => {
    await t.patch(t.${this.showHelper(record)}, { params: { ${singular}: ${this.attributesString()} } });
    t.assertRedirectedTo(t.${this.showHelper(record)});
  });

  it<{ testCase: ${testClassName} }>("should destroy ${singular}", async ({ testCase: t }) => {
    await assertDifference(() => ${modelClassName}.count(), -1, async () => {
      await t.delete(t.${this.showHelper(record)});
    });

    t.assertRedirectedTo(t.${this.indexHelper({ type: "url" })}());
  });
});
`;
};

const apiFunctionalTest: Template = function () {
  const { testPath, testClassName, modelClassName, singular, record, preamble } = header.call(this);
  return `${preamble}
describe("${testPath}", () => {
  it<{ testCase: ${testClassName} }>("should get index", async ({ testCase: t }) => {
    await t.get(t.${this.indexHelper()}Url(), { as: ":json" });
    t.assertResponse(":success");
  });

  it<{ testCase: ${testClassName} }>("should create ${singular}", async ({ testCase: t }) => {
    await assertDifference(() => ${modelClassName}.count(), async () => {
      await t.post(t.${this.indexHelper()}Url(), { params: { ${singular}: ${this.attributesString()} }, as: ":json" });
    });

    t.assertResponse(":created");
  });

  it<{ testCase: ${testClassName} }>("should show ${singular}", async ({ testCase: t }) => {
    await t.get(t.${this.showHelper(record)}, { as: ":json" });
    t.assertResponse(":success");
  });

  it<{ testCase: ${testClassName} }>("should update ${singular}", async ({ testCase: t }) => {
    await t.patch(t.${this.showHelper(record)}, { params: { ${singular}: ${this.attributesString()} }, as: ":json" });
    t.assertResponse(":success");
  });

  it<{ testCase: ${testClassName} }>("should destroy ${singular}", async ({ testCase: t }) => {
    await assertDifference(() => ${modelClassName}.count(), -1, async () => {
      await t.delete(t.${this.showHelper(record)}, { as: ":json" });
    });

    t.assertResponse(":no_content");
  });
});
`;
};

const systemTest: Template = function () {
  const className = pluralize(this.className());
  const testClassName = `${className.split("::").pop()}Test`;
  const humanName = this.humanName();
  const singular = this.singularTableName();
  const plural = this.pluralTableName();
  const indexUrl = `${camelize(`${plural}_url`, false)}`;
  const showUrl = `${camelize(`${singular}_url`, false)}`;
  const root = "../".repeat(this.classPath().length + 1);
  const modelClassName = this.className().split("::").pop();
  const namespaceDirs = this["isNamespaced"]() ? this["namespaceDirs"]() : [];
  return `import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApplicationSystemTestCase } from "${root}application-system-test-case${this.ext()}";
import { ${modelClassName} } from "../${root}app/models/${[...namespaceDirs, ...this["classPath"](), dasherize(this.fileName)].join("/")}.js";

export class ${testClassName} extends ApplicationSystemTestCase {
  declare "@${singular}": ${modelClassName};

  static {
    this.setup(async function (this: ${testClassName}) {
      this["@${singular}"] = await this.${this.fixtureName()}("one");
    });
  }
}

describe("${className}Test", () => {
  let t: ${testClassName};

  beforeEach(() => {
    t = new ${testClassName}(expect.getState().currentTestName!);
  });

  afterEach(async () => {
    await t._context?.close();
  });

  it("visiting the index", async () => {
    const page = await t.page();
    await page.goto(t.${indexUrl}());
    await expect.element(page.locator("h1", { hasText: "${pluralize(humanName)}" })).toBeInTheDocument();
  });

  it("should create ${humanName.toLowerCase()}", async () => {
    const page = await t.page();
    await page.goto(t.${indexUrl}());
    await page.getByText("New ${humanName.toLowerCase()}").click();

${Object.entries(this.attributesHash())
  .map(([attr, value]) =>
    this.isBoolean(attr)
      ? `    if (${value}) await page.getByLabel("${humanize(attr)}").check();\n`
      : `    await page.getByLabel("${humanize(attr)}").fill(${value} ?? "");\n`,
  )
  .join("")}    await page.getByText("Create ${humanName}").click();

    await expect.element(page.getByText("${humanName} was successfully created")).toBeInTheDocument();
    await page.getByText("Back").click();
  });

  it("should update ${humanName}", async () => {
    const page = await t.page();
    await page.goto(t.${showUrl}(t["@${singular}"]));
    await page.getByText("Edit this ${humanName.toLowerCase()}").first().click();

${Object.entries(this.attributesHash())
  .map(([attr, value]) =>
    this.isBoolean(attr)
      ? `    if (${value}) await page.getByLabel("${humanize(attr)}").check();\n`
      : this.isDatetime(attr) || this.isTime(attr)
        ? `    await page.getByLabel("${humanize(attr)}").fill(String(${value} ?? ""));\n`
        : `    await page.getByLabel("${humanize(attr)}").fill(${value} ?? "");\n`,
  )
  .join("")}    await page.getByText("Update ${humanName}").click();

    await expect.element(page.getByText("${humanName} was successfully updated")).toBeInTheDocument();
    await page.getByText("Back").click();
  });

  it("should destroy ${humanName}", async () => {
    const page = await t.page();
    await page.goto(t.${showUrl}(t["@${singular}"]));
    await page.getByText("Destroy this ${humanName.toLowerCase()}").first().click();

    await expect.element(page.getByText("${humanName} was successfully destroyed")).toBeInTheDocument();
  });
});
`;
};

export const TEMPLATES: Record<
  "functional_test" | "api_functional_test" | "system_test",
  Template
> = {
  system_test: systemTest,
  functional_test: functionalTest,
  api_functional_test: apiFunctionalTest,
};
