import { afterEach, beforeEach, describe, it } from "vitest";
import "../test-helpers/active-record-unit.js";
import { Developer } from "../test-helpers/fixtures/developer.js";
import { Project } from "../test-helpers/fixtures/project.js";
import * as ActiveRecord from "@blazetrails/activerecord";
import { RouteSet } from "@blazetrails/actionpack";
import { include } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import type { FormBuilder } from "../helpers/form-helper.js";
import { assertDomEqual } from "../testing/dom-assertions.js";

const Routes = new RouteSet();
Routes.draw(function () {
  this.resources("developers", () => {
    this.resources("projects");
  });
});

describe("FormHelperActiveRecordTest", () => {
  let view: Base;
  let developer: Developer;
  let rendered: unknown;

  function formFor(...args: Parameters<Base["formFor"]>): unknown {
    return (rendered = view.formFor(...args));
  }

  function concat(string: unknown): unknown {
    return (view as unknown as { concat(string: unknown): unknown }).concat(string);
  }

  beforeEach(async () => {
    const pool = ActiveRecord.Base.connectionPool();
    await pool.schemaReflection.loadAllBang(pool);
    developer = new Developer();
    developer.id = 123;
    (developer as unknown as { name: string }).name = "developer #123";

    const project = new Project();
    project.id = 321;
    (project as unknown as { name: string }).name = "project #321";
    await project.save();

    await (
      developer as unknown as { projects: { push(r: Project): Promise<unknown> } }
    ).projects.push(project);
    await developer.save();
    view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null);
    include(view.constructor as new (...args: never[]) => unknown, Routes.urlHelpers());
  });

  afterEach(async () => {
    await Project.delete(321);
    await Developer.delete(123);
  });

  it("nested fields for with child index option override on a nested attributes collection association", async () => {
    const first = await (
      developer as unknown as { projects: { first(): Promise<Project> } }
    ).projects.first();
    formFor(developer, {}, (f: FormBuilder) =>
      concat(
        f.fieldsFor("projects", first, { childIndex: "abc" }, (cf) => concat(cf.textField("name"))),
      ),
    );

    const expected = wholeForm(
      "/developers/123",
      "edit_developer_123",
      "edit_developer",
      {
        method: "patch",
      },
      () =>
        '<input id="developer_projects_attributes_abc_name" name="developer[projects_attributes][abc][name]" type="text" value="project #321" />' +
        '<input id="developer_projects_attributes_abc_id" name="developer[projects_attributes][abc][id]" type="hidden" value="321" autocomplete="off" />',
    );

    assertDomEqual(expected, rendered);
  });

  function hiddenFields(method: string | null = null): string {
    let txt = `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />`;

    if (method && !["get", "post"].includes(method)) {
      txt += `<input name="_method" type="hidden" value="${method}" autocomplete="off" />`;
    }

    return txt;
  }

  function formText(
    action = "/",
    id: string | null = null,
    htmlClass: string | null = null,
    remote: unknown = null,
    multipart: unknown = null,
    method: string | null = null,
  ): string {
    let txt = `<form accept-charset="UTF-8" action="${action}"`;
    if (multipart) txt += ` enctype="multipart/form-data"`;
    if (remote) txt += ` data-remote="true"`;
    if (htmlClass) txt += ` class="${htmlClass}"`;
    if (id) txt += ` id="${id}"`;
    method = method === "get" ? "get" : "post";
    return txt + ` method="${method}">`;
  }

  function wholeForm(
    action = "/",
    id: string | null = null,
    htmlClass: string | null = null,
    options: { method?: string; remote?: unknown; multipart?: unknown } | string | null = null,
    block?: () => string,
  ): string {
    const contents = block ? block() : "";

    let method: string | null | undefined, remote: unknown, multipart: unknown;
    if (typeof options === "object" && options !== null) {
      ({ method, remote, multipart } = options);
    } else {
      method = options;
    }

    return (
      formText(action, id, htmlClass, remote, multipart, method) +
      hiddenFields(method) +
      contents +
      "</form>"
    );
  }
});
