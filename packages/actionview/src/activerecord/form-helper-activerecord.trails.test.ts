import { describe, expect, it } from "vitest";
import "../test-helpers/active-record-unit.js";
import * as ActiveRecord from "@blazetrails/activerecord";
import { Developer } from "../test-helpers/fixtures/developer.js";
import { Project } from "../test-helpers/fixtures/project.js";
import { Base } from "../base.js";
import type { FormBuilder } from "../helpers/form-helper.js";

describe("FormHelperActiveRecordTest", () => {
  it("nested fields for params round-trip through assignAttributes to the nested attributes writer", async () => {
    const pool = ActiveRecord.Base.connectionPool();
    await pool.schemaReflection.loadAllBang(pool);
    const developer = new Developer();
    const view = new (Base.withEmptyTemplateCache())(null, {}, null);
    const html = String(
      view.fieldsFor("developer", developer, {}, (f: FormBuilder) =>
        f.fieldsFor("projects", new Project(), { childIndex: "abc" }, (cf) => cf.textField("name")),
      ),
    );
    const [, key] = /name="developer\[(\w+)\]\[abc\]\[name\]"/.exec(html)!;

    await developer.assignAttributes({ [key]: { abc: { name: "renamed" } } });
    const projects = (developer as unknown as { projects: { target: Project[] } }).projects;
    expect((projects.target[0] as unknown as { name: string }).name).toBe("renamed");
  });
});
