import { describe, expect, it } from "vitest";
import "../test-helpers/active-record-unit.js";
import * as ActiveRecord from "@blazetrails/activerecord";
import { Developer } from "../test-helpers/fixtures/developer.js";
import { Project } from "../test-helpers/fixtures/project.js";
import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { FixtureResolver } from "../testing/resolvers.js";
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

describe("fields_for nested model awaits an async block", () => {
  it("renders the awaited block for each nested record", async () => {
    const pool = ActiveRecord.Base.connectionPool();
    await pool.schemaReflection.loadAllBang(pool);
    const developer = new Developer();
    const lookupContext = new LookupContext(null, {}, ["test"]);
    lookupContext.appendViewPaths([new FixtureResolver({})]);
    const view = new (Base.withEmptyTemplateCache())(lookupContext, {}, null);
    const html = String(
      await view.fieldsFor("developer", developer, {}, (f: FormBuilder) =>
        f.fieldsFor("projects", new Project(), { childIndex: "abc" }, async () => {
          view.outputBuffer!.safeAppend(await view.render({ plain: "<b>rendered</b>" }));
        }),
      ),
    );
    expect(html).toBe("<b>rendered</b>");
  });
});
