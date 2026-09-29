import type { ScaffoldGenerator } from "./scaffold-generator.js";

type Template = (this: ScaffoldGenerator) => string;

function header(this: ScaffoldGenerator) {
  const testClassName = `${this.controllerClassName().split("::").join("")}ControllerTest`;
  const modelClassName = this.className().split("::").join("");
  const singular = this.singularTableName();
  const root = "../".repeat(this.controllerClassPath().length + 1);
  const preamble = `import { describe, it } from "vitest";
import { IntegrationTest } from "@blazetrails/actionpack";
import { assertDifference, registerConstant } from "@blazetrails/activesupport";
import { ${modelClassName} } from "../${root}app/models/${this.filePath()}.js";
import "${root}test-helper.js";

class ${testClassName} extends IntegrationTest {
  declare "@${singular}": ${modelClassName};

  static {
    registerConstant("${testClassName}", this);
    this.setup(async function (this: ${testClassName}) {
      this["@${singular}"] = (await this.fixture("${this.fixtureName()}", "one")) as ${modelClassName};
    });
  }
}
`;
  return { testClassName, modelClassName, singular, record: `t["@${singular}"]`, preamble };
}

const functionalTest: Template = function () {
  const { testClassName, modelClassName, singular, record, preamble } = header.call(this);
  return `${preamble}
describe("${testClassName}", () => {
  it("should get index", async ({ testCase: t }) => {
    await t.get(t.${this.indexHelper({ type: "url" })}());
    t.assertResponse("success");
  });

  it("should get new", async ({ testCase: t }) => {
    await t.get(t.${this.newHelper()}());
    t.assertResponse("success");
  });

  it("should create ${singular}", async ({ testCase: t }) => {
    await assertDifference(() => ${modelClassName}.count(), async () => {
      await t.post(t.${this.indexHelper({ type: "url" })}(), { params: { ${singular}: ${this.attributesString()} } });
    });

    t.assertRedirectedTo(t.${this.showHelper(`await ${modelClassName}.last()`)});
  });

  it("should show ${singular}", async ({ testCase: t }) => {
    await t.get(t.${this.showHelper(record)});
    t.assertResponse("success");
  });

  it("should get edit", async ({ testCase: t }) => {
    await t.get(t.${this.editHelper(record)});
    t.assertResponse("success");
  });

  it("should update ${singular}", async ({ testCase: t }) => {
    await t.patch(t.${this.showHelper(record)}, { params: { ${singular}: ${this.attributesString()} } });
    t.assertRedirectedTo(t.${this.showHelper(record)});
  });

  it("should destroy ${singular}", async ({ testCase: t }) => {
    await assertDifference(() => ${modelClassName}.count(), -1, async () => {
      await t.delete(t.${this.showHelper(record)});
    });

    t.assertRedirectedTo(t.${this.indexHelper({ type: "url" })}());
  });
});
`;
};

const apiFunctionalTest: Template = function () {
  const { testClassName, modelClassName, singular, record, preamble } = header.call(this);
  return `${preamble}
describe("${testClassName}", () => {
  it("should get index", async ({ testCase: t }) => {
    await t.get(t.${this.indexHelper()}Url(), { as: "json" });
    t.assertResponse("success");
  });

  it("should create ${singular}", async ({ testCase: t }) => {
    await assertDifference(() => ${modelClassName}.count(), async () => {
      await t.post(t.${this.indexHelper()}Url(), { params: { ${singular}: ${this.attributesString()} }, as: "json" });
    });

    t.assertResponse("created");
  });

  it("should show ${singular}", async ({ testCase: t }) => {
    await t.get(t.${this.showHelper(record)}, { as: "json" });
    t.assertResponse("success");
  });

  it("should update ${singular}", async ({ testCase: t }) => {
    await t.patch(t.${this.showHelper(record)}, { params: { ${singular}: ${this.attributesString()} }, as: "json" });
    t.assertResponse("success");
  });

  it("should destroy ${singular}", async ({ testCase: t }) => {
    await assertDifference(() => ${modelClassName}.count(), -1, async () => {
      await t.delete(t.${this.showHelper(record)}, { as: "json" });
    });

    t.assertResponse("no_content");
  });
});
`;
};

export const TEMPLATES: Record<"functional_test" | "api_functional_test", Template> = {
  functional_test: functionalTest,
  api_functional_test: apiFunctionalTest,
};
