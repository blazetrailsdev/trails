import { afterEach, beforeEach, describe, it } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { assertEqual } from "@blazetrails/activesupport";
import { rbInspect } from "@blazetrails/ruby-compat";
import { DetailsKey } from "../lookup-context.js";
import type { PathSet } from "../path-set.js";
import { FixtureResolver } from "../testing/resolvers.js";

const FIXTURE_LOAD_PATH = new FixtureResolver({
  "test/nil_return.tse": "This is nil: <%== null %>\n",
  "test/render_file_with_ruby_keyword_locals.tse": 'The class is <%= localAssigns["class"] %>',
  "test/render_file_inspect_local_assigns.tse":
    "<%= htmlSafe(RubyCompat.rbInspect(localAssigns)) %>",
  "test/test_template_with_delegation_reserved_keywords.tse":
    "<%= _ %> <%= arg %> <%= args %> <%= block %>",
  "test/render_file_unicode_local.tse": "<%= ŝ %>",
  "test/render_file_with_locals_and_default.tse":
    '<%= typeof secret !== "undefined" && secret != null ? secret : "one" %>',
});

describe("CompiledTemplatesTest", () => {
  let viewPaths: PathSet;

  function render(...args: Parameters<typeof ActionController.Base.render>) {
    return ActionController.Base.render(...args);
  }

  beforeEach(() => {
    viewPaths = ActionController.Base.viewPaths();
    ActionController.Base.viewPaths([FIXTURE_LOAD_PATH]);
    for (const path of ActionController.Base.viewPaths()) path.clearCache!();
  });

  afterEach(() => {
    ActionController.Base.viewPaths(viewPaths);
    DetailsKey.clear();
  });

  it("template with nil erb return", async () => {
    assertEqual("This is nil: \n", await render({ template: "test/nil_return" }));
  });

  it("template with ruby keyword locals", async () => {
    assertEqual(
      "The class is foo",
      await render({
        template: "test/render_file_with_ruby_keyword_locals",
        locals: { class: "foo" },
      }),
    );
  });

  it("template with invalid identifier locals", async () => {
    const locals = {
      foo: "bar",
      Foo: "bar",
      "d-a-s-h-e-s": "",
      "white space": "",
    };
    assertEqual(
      rbInspect(locals),
      await render({ template: "test/render_file_inspect_local_assigns", locals: locals }),
    );
  });

  it("template with delegation reserved keywords", async () => {
    const locals = {
      _: "one",
      arg: "two",
      args: "three",
      block: "four",
    };
    assertEqual(
      "one two three four",
      await render({
        template: "test/test_template_with_delegation_reserved_keywords",
        locals: locals,
      }),
    );
  });

  it("template with unicode identifier", async () => {
    assertEqual(
      "🎂",
      await render({ template: "test/render_file_unicode_local", locals: { ŝ: "🎂" } }),
    );
  });

  it("template gets recompiled when using different keys in local assigns", async () => {
    assertEqual("one", await render({ template: "test/render_file_with_locals_and_default" }));
    assertEqual(
      "two",
      await render({
        template: "test/render_file_with_locals_and_default",
        locals: { secret: "two" },
      }),
    );
  });
});
