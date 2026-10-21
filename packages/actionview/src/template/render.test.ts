import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ORIGINAL_LOCALES } from "../test-helpers/abstract-unit.js";

import { ActionController, Mime } from "@blazetrails/actionpack";

import { Base } from "../base.js";
import { Template } from "../template.js";
import { TemplateHandlers } from "./handlers.js";
import { FixtureResolver } from "../testing/resolvers.js";
import {
  MemoryStore,
  I18n,
  Logger,
  assert,
  symbolizeKeys,
  SafeBuffer,
  assertEqual,
  assertIncludes,
  assertInstanceOf,
  assertMatch,
  assertNil,
  assertNoMatch,
  assertNot,
  assertNotEqual,
  assertNothingRaised,
  assertRaises,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  File,
  NotImplementedError,
  chomp,
  stringSplit,
  rbInspect,
} from "@blazetrails/ruby-compat";
import { MissingTemplate, TemplateError } from "./error.js";
import { Digestor } from "../digestor.js";
import type { PathSet } from "../path-set.js";
import { PartialRenderer } from "../renderer/partial-renderer.js";
import { Customer, GoodCustomer } from "../test-helpers/fake-models.js";

Template.mimeTypesImplementation = Mime;

const __dir__ = new URL(".", import.meta.url).pathname;

class TestController extends ActionController.Base {
  declare performCaching: boolean;
}

const CustomHandler = {
  call: (_template: unknown, source: string): string =>
    `@output_buffer = ''.dup\n@output_buffer << 'source: ${rbInspect(source)}'\n`,
};

class TestRenderable {
  renderIn(_viewContext: unknown): string {
    return "Hello, World!";
  }
}

const fixtures: Record<string, string> = {
  "test/_customer.html.tse":
    'Hello: <%= (() => { try { return customer.name; } catch { return "Anonymous"; } })() %>',
  "test/_template_not_named_customer.html.tse": "Hello: <%= customer.name %>\n",
  "test/_object_inspector.tse": '<%= `[${object_inspector.join(", ")}]` -%>',
  "test/_partial_name_in_local_assigns.tse":
    '<%= Object.hasOwn(localAssigns, "partial_name_in_local_assigns") %>',
  "test/_layout_for_partial.html.tse": "Before (<%= name %>)\n<%= yield %>\nAfter",
  "test/_b_layout_for_partial.html.tse": "<b><%= yield %></b>",
  "test/_b_layout_for_partial_with_object.html.tse":
    '<b class="<%= customer.name.toLowerCase() %>"><%= yield %></b>',
  "test/_b_layout_for_partial_with_object_counter.html.tse":
    '<b data-counter="<%= customer_counter %>"><%= yield %></b>',
  "test/_customer_with_var.html.tse":
    "<%= customer.name %> <%= customer.name %> <%= customer.name %>",
  "test/_local_inspector.html.tse": '<%= Object.keys(localAssigns).sort().join(",") -%>',
  "test/hello_world.tse": "Hello world!",
  "test/_partial_only.tse": "only partial",
  "test/_partial.html.tse": "partial html",
  "test/_partial.js.tse": "partial js",
  "test/_partial_with_variants.html+grid.tse": "<h1>Partial with variants</h1>\n",
  "test/_counter.html.tse": "<%= counter_counter %>",
  "test/_200.html.tse": "<h1>Invalid partial</h1>\n",
  "test/_FooBar.html.tse": "🍣\n",
  "test/_a-in.html.tse": "",
  "test/_🍣.tse": "",
  "test/one.html.tse": '<%= render({ partial: "test/two" }) %> world',
  "test/_two.html.tse": "Hello",
  "test/render_template_with_ivar.tse": "The secret is <%= this.secret %>\n",
  "test/render_template_with_locals.tse": "The secret is <%= secret %>\n",
  "test/dot.directory/render_template_with_ivar.tse": "The secret is <%= this.secret %>\n",
  "comments/empty.html.tse": "<h1>No Comment</h1>",
  "comments/empty.xml.tse": "<error>No Comment</error>",
  "comments/empty.de.html.tse": "<h1>Kein Kommentar</h1>",
  "comments/empty.html+grid.tse": "<h1>No Comment</h1>\n",
  "_top_level_partial_only.tse": "top level partial",
  "_top_level_partial.html.tse": "top level partial html",
  "shared.html.tse": "Elastica",
  "test/mixing_formats.html.tse":
    '{"format":"HTML", "children":\n[\n  <%= raw((String(await render({ partial: "first", formats: ":xml" })).trimEnd())) %>,\n  <%= raw((String(await render({ partial: "second" })).trimEnd())) %>\n]}\n',
  "test/mixing_formats_deep.html.tse":
    '{"format":"HTML", "children":\n[\n  <%= raw((String(await render({ partial: "first_layer", formats: ":xml" })).trimEnd())) %>,\n  <%= raw((String(await render({ partial: "second_layer" })).trimEnd())) %>\n]}\n',
  "test/_first.html.tse": '"HTML"\n',
  "test/_first.xml.tse": '"XML"\n',
  "test/_second.html.tse": '"HTML"\n',
  "test/_second.xml.tse": '"XML"\n',
  "test/_first_layer.xml.tse":
    '{"format":"XML", "children":\n[\n  <%= raw((String(await render({ partial: "first" })).trimEnd())) %>\n]}\n',
  "test/_second_layer.html.tse":
    '{"format":"HTML", "children":\n[\n  <%= raw((String(await render({ partial: "first" })).trimEnd())) %>\n]}\n',
  "test/js_html_fallback.js.tse":
    'document.write("<%= j(raw((String(await render({ partial: "js_html_fallback" })).trimEnd())) %>")\n',
  "test/_js_html_fallback.html.tse": "<b>Hello from a HTML partial!</b>\n",
  "test/html_template.html.tse":
    '<%= render({ partial: "test/first_json_partial", formats: ":json" }) %>',
  "test/_first_json_partial.json.tse": '<%= render({ partial: "test/second_json_partial" }) %>',
  "test/_second_json_partial.json.tse": "Third level",
  "test/change_priority.html.tse":
    '<%= render({ partial: "test/json_change_priority", formats: ":json" }) %>\nHTML Template, but <%= render({ partial: "test/changing_priority" }) %> partial',
  "test/_json_change_priority.json.tse": '<%= render({ partial: "test/changing_priority" }) %>',
  "test/_changing_priority.html.tse": "HTML",
  "test/_changing_priority.json.tse": "JSON",
  "with_format.json.tse": '<%= render({ partial: "missing", formats: [":json"] }) %>\n',
  "comments/empty.html.builder": "<h1>No Comment</h1>\n",
  "plain_text.raw": "<%= hello_world %>\n",
  "plain_text_with_characters.raw": "Here are some characters: !@#$%^&*()-=\"'}{`\n",
  "test/hello_world.da.html.tse": "Hey verden",
  "test/hello_world.pt-BR.html.tse": "Ola mundo",
  "test/syntax_error.html.tse": "<%= foo(\n  1,\n  2,\n%>\n",
  "test/_raise_indentation.html.tse":
    '<p>First paragraph</p>\n<p>Second paragraph</p>\n<p>Third paragraph</p>\n<p>Fourth paragraph</p>\n<p>Fifth paragraph</p>\n<p>Sixth paragraph</p>\n<p>Seventh paragraph</p>\n<p>Eight paragraph</p>\n<p>Ninth paragraph</p>\n<p>Tenth paragraph</p>\n<%= (() => { throw new Error("error here!"); })() %>\n<p>Eleventh paragraph</p>\n<p>Twelfth paragraph</p>',
  "test/_raise.html.tse": "<%= doesnt_exist %>",
  "test/sub_template_raise.html.tse": '<%= render({ partial: "test/raise" }) %>',
  "test/_klass.tse":
    '<%= klass === null ? "NilClass" : klass === false ? "FalseClass" : klass.constructor.name %>',
  "test/_partial_iteration_1.tse":
    '<%= typeof partial_iteration_1_iteration === "undefined" ? "" : "local-variable" %>\n',
  "test/_partial_iteration_2.tse":
    '<%= typeof partial_iteration_2_iteration === "undefined" ? "" : "local-variable" -%>',
  "customers/_customer.html.tse": "<%= greeting %>: <%= customer.name %>",
  "customers/_customer.xml.tse":
    "<greeting><%= greeting %></greeting><name><%= customer.name %></name>",
  "good-customers/_good_customer.html.tse":
    "<%= greeting %> good customer: <%= good_customer.name %><%= good_customer_counter %>",
  "test/_customer_greeting.tse": "<%= greeting %>: <%= customer_greeting.name %>",
  "test/_partial_name_local_variable.tse": "<%= partial_name_local_variable %>\n",
  "test/_layout_with_partial_and_yield.html.tse":
    'Before\n<%= render({ partial: "test/partial" }) %>\n<%= yield %>\nAfter\n',
  "layouts/yield.tse": '<title><%= yield("title") %></title>\n<%= yield %>\n',
  "layouts/yield_with_render_inline_inside.tse":
    "<%= render({ inline: 'welcome' }) %>\n<%= yield %>\n",
  "layouts/yield_with_render_partial_inside.tse":
    "<%= render({ partial: 'test/partial' }) %>\n<%= yield %>\n",
  "layouts/render_partial_html.tse":
    "<%= render({ partial: 'test/partialhtml' }) %>\n<%= yield %>\n",
  "test/_partialhtml.html": "<h1>partial html</h1>",
  "layouts/_yield_only.tse": "<%= yield %>\n",
  "layouts/_yield_with_params.tse": "<%= yield('Yield!') %>\n",
  "layouts/_partial_and_yield.tse": "<%= render({ partial: 'test/partial' }) %>\n<%= yield %>\n",
  "test/_partial_with_partial.tse": "<%= render('test/partial') %>\npartial with partial\n",
  "test/_partial_shortcut_with_block_content.html.tse":
    '<%= render("test/layout_for_block_with_args", {}, (arg_1, arg_2) => { %>\n  Yielded: <%= arg_1 %>/<%= arg_2 %>\n<% }) %>\n',
  "test/_layout_for_block_with_args.html.tse": "Before\n<%= yield('arg1', 'arg2') %>\nAfter",
  "test/_partial_with_layout.tse":
    "<%= render({ partial: 'test/partial', layout: 'test/layout_for_partial', locals: { name: 'Bar!' } }) %>\npartial with layout\n",
  "test/_partial_with_layout_block_partial.tse":
    "<%= render({ layout: 'test/layout_for_partial', locals: { name: 'Bar!' } }, {}, async () => { %>\n  <%= render('test/partial') %>\n<% }) %>\npartial with layout\n",
  "test/_partial_with_layout_block_content.tse":
    "<%= render({ layout: 'test/layout_for_partial', locals: { name: 'Bar!' } }, {}, () => { %>\n  Content from inside layout!\n<% }) %>\npartial with layout\n",
  "test/_partial_with_only_html_version.html.tse": "partial with only HTML version",
  "test/template.tse": "<%= template.path %>",
  "test/_directory/_partial_with_locales.html.tse": "Hello <%= name %>",
  "test/nested_layout.tse":
    '<% contentFor("title", "title") -%>\n<% contentFor("column", () => { -%>column<% }) -%>\n<%= render({ layout: \'layouts/column\' }, {}, () => { -%>content<% }) -%>',
  "layouts/_column.html.tse":
    '<div id="column"><%= yield("column") %></div>\n<div id="content"><%= yield %></div>',
  "test/layout_render_file.tse":
    "<% contentFor(\"title\", () => { %>title<% }) -%>\n<%= render({ template: 'layouts/yield' }) -%>\n",
  "test/layout_render_object.tse":
    '<%= render({ layout: "layouts/customers" }, {}, (customer) => { %><%= customer.name %><% }) %>',
  "layouts/_customers.tse": '<title><%= yield({ name: "David" }) %></title>',
  "test/cache_fragment_inside_render_layout_block_1.html.tse":
    '<%= render({ layout: "layouts/yield_only" }, {}, async () => { %><%= cache("foo", {}, () => { %>CAT<% }) %><% }) %>',
  "test/cache_fragment_inside_render_layout_block_2.html.tse":
    '<%= render({ layout: "layouts/yield_only" }, {}, async () => { %><%= cache("foo", {}, () => { %>DOG<% }) %><% }) %>',
  "test/caching_predicate.html.tse":
    '<%= cache("foo", {}, () => { %>\n  <%= isCaching() ? "Cached!" : null %>\n<% }) %>\n',
  "test/caching_predicate_outside_cache.html.tse": '<%= isCaching() ? null : "Not cached!" %>\n',
  "test/_cached_customer.tse":
    "<%= cache(cached_customer, {}, () => { %>\n  Hello: <%= cached_customer.name %>\n<% }) %>",
  "test/_cached_set.tse":
    "<%= cached_set[0] %> | <%= cached_set[1] %> | <%= cached_set[2] %> | <%= cached_set[3] %> | <%= cached_set[4] %>\n",
  "test/malformed/malformed~": "",
  "test/malformed/malformed.tse~": "",
  "test/malformed/malformed.html.tse~": "",
  "test/malformed/malformed.en.html.tse~": "",
  "test/uncacheable.html.tse":
    '<%= cache("uhoh", {}, () => { %>\n  <%= uncacheableBang() %>\n<% }) %>\n',
};
const resolver = new FixtureResolver(fixtures);

let view: Base & {
  controller: TestController | null;
  combinedFragmentCacheKey(key: unknown): unknown[];
};
let controllerView: Base;

function setupView(paths: PathSet): void {
  const assigns = { secret: "in the sauce" };

  view = class extends Base.withEmptyTemplateCache() {
    declare controller: TestController | null;

    viewCacheDependencies(): unknown[] {
      return [];
    }

    combinedFragmentCacheKey(key: unknown): unknown[] {
      return [":views", key];
    }
  }.withViewPaths(paths, assigns);

  const controller = new TestController();
  controller.performCaching = true;
  controller.cacheStore = ":memory_store";
  view.controller = controller;

  controllerView = new (controller.viewContextClass().withEmptyTemplateCache())(
    controller.lookupContext,
    controller.viewAssigns(),
    controller,
  );

  I18n.backend().storeTranslations("da", {});
  I18n.backend().storeTranslations("pt-BR", {});

  assertEqual(ORIGINAL_LOCALES, I18n.availableLocales().map(String).sort());
}

function cacheKey(...namesAndVirtualPath: unknown[]): unknown {
  const virtualPath = namesAndVirtualPath.pop() as string;
  const digest = Digestor.digest({
    name: virtualPath,
    format: ":html",
    finder: view.lookupContext!,
    dependencies: [],
  });
  return view.combinedFragmentCacheKey([`${virtualPath}:${digest}`, ...namesAndVirtualPath]);
}

function teardown(): void {
  I18n.reloadBang();
  ActionController.Base.viewPaths().paths.map((path) => path.clearCache!());
}

describe("CachedViewRenderTest", () => {
  beforeEach(() => {
    ActionController.Base.viewPaths([resolver]);
    setupView(ActionController.Base.viewPaths());
  });

  afterEach(teardown);

  it("render without options", async () => {
    const e = await assertRaises([ArgumentError], {}, () => view.render({}));
    assertMatch(/You invoked render but did not give any of (.+) option\./, e.message);
  });

  it("render template", async () => {
    expect(String(await view.render({ template: "test/hello_world" }))).toBe("Hello world!");
  });

  it("render file", async () => {
    const templatePath = File.expandPath("./fixtures/test/hello_world.tse", __dir__);
    expect(String(await view.render({ file: templatePath }))).toBe("Hello world!");
  });

  it("render file with full path no extension", async () => {
    const templatePath = File.expandPath("./fixtures/test/hello_world", __dir__);
    const e = await assertRaises([ArgumentError], {}, () => view.render({ file: templatePath }));
    assertMatch(/File (.+) does not exist/, e.message);
  });

  it("render file with invalid full path", async () => {
    const templatePath = File.expandPath("./fixtures/test/hello_world_invalid.tse", __dir__);
    const e = await assertRaises([ArgumentError], {}, () => view.render({ file: templatePath }));
    assertMatch(/File (.+) does not exist/, e.message);
  });

  it("render file with relative path", async () => {
    const templatePath = "fixtures/test/hello_world.tse";
    const e = await assertRaises([ArgumentError], {}, () => view.render({ file: templatePath }));
    assertMatch(
      /`render file:` should be given the absolute path to a file. (.+) was given instead/,
      e.message,
    );
  });

  it("render template with format", async () => {
    assertMatch(
      "<h1>No Comment</h1>",
      String(await view.render({ template: "comments/empty", formats: [":html"] })),
    );
    assertMatch(
      "<error>No Comment</error>",
      String(await view.render({ template: "comments/empty", formats: [":xml"] })),
    );
    assertMatch(
      "<error>No Comment</error>",
      String(await view.render({ template: "comments/empty", formats: ":xml" })),
    );
  });

  it("render partial implicitly use format of the rendered template", async () => {
    view.lookupContext!.formats = [":json"];
    expect(String(await view.render({ template: "test/one", formats: [":html"] }))).toBe(
      "Hello world",
    );
  });

  it("render template with locale", async () => {
    expect(String(await view.render({ template: "comments/empty", locale: [":de"] }))).toBe(
      "<h1>Kein Kommentar</h1>",
    );
    expect(String(await view.render({ template: "comments/empty", locale: ":de" }))).toBe(
      "<h1>Kein Kommentar</h1>",
    );
  });

  it("render template with variants", async () => {
    expect(String(await view.render({ template: "comments/empty", variants: ":grid" }))).toBe(
      "<h1>No Comment</h1>\n",
    );
  });

  it("render template at top level", async () => {
    expect(String(await view.render({ template: "/shared" }))).toBe("Elastica");
  });

  it("render template with instance variable", async () => {
    expect(String(await view.render({ template: "test/render_template_with_ivar" }))).toBe(
      "The secret is in the sauce\n",
    );
  });

  it("render template with locals", async () => {
    const locals = { secret: "in the sauce" };
    expect(
      String(await view.render({ template: "test/render_template_with_locals", locals: locals })),
    ).toBe("The secret is in the sauce\n");
  });

  it("render template with dot in path", async () => {
    expect(
      String(await view.render({ template: "test/dot.directory/render_template_with_ivar" })),
    ).toBe("The secret is in the sauce\n");
  });

  it("render partial from default", async () => {
    expect(String(await view.render("test/partial_only"))).toBe("only partial");
  });

  it("render partial", async () => {
    expect(String(await view.render({ partial: "test/partial_only" }))).toBe("only partial");
  });

  it("render partial with format", async () => {
    expect(String(await view.render({ partial: "test/partial" }))).toBe("partial html");
  });

  it("render partial with variants", async () => {
    expect(
      String(await view.render({ partial: "test/partial_with_variants", variants: ":grid" })),
    ).toBe("<h1>Partial with variants</h1>\n");
  });

  it("render partial with selected format", async () => {
    expect(String(await view.render({ partial: "test/partial", formats: ":html" }))).toBe(
      "partial html",
    );
    expect(String(await view.render({ partial: "test/partial", formats: [":js"] }))).toBe(
      "partial js",
    );
  });

  it("render partial at top level", async () => {
    expect(String(await view.render({ partial: "/top_level_partial_only" }))).toBe(
      "top level partial",
    );
  });

  it("render partial with format at top level", async () => {
    expect(String(await view.render({ partial: "/top_level_partial" }))).toBe(
      "top level partial html",
    );
  });

  it("render partial with locals", async () => {
    expect(
      String(await view.render({ partial: "test/counter", locals: { counter_counter: 5 } })),
    ).toBe("5");
  });

  it("render partial with locals from default", async () => {
    expect(String(await view.render("test/partial_only", { counter_counter: 5 }))).toBe(
      "only partial",
    );
  });

  it("render partial with number", async () => {
    await assertNothingRaised(() => view.render({ partial: "test/200" }));
  });

  it("render partial with missing filename", async () => {
    await assertRaises([MissingTemplate], {}, () => view.render({ partial: "test/" }));
  });

  it("render partial with incompatible object", async () => {
    await assertRaises(
      [ArgumentError],
      {
        match: "'nil' is not an ActiveModel-compatible object. It must implement #to_partial_path.",
      },
      () => view.render({ partial: null }),
    );
  });

  it("render renderable with nil", async () => {
    await assertRaises(
      [ArgumentError],
      { match: "'nil' is not a renderable object. It must implement #render_in." },
      () => view.render({ renderable: null }),
    );
  });

  it("render renderable with incompatible object", async () => {
    const object = new Object();
    await assertRaises(
      [ArgumentError],
      { match: `'${rbInspect(object)}' is not a renderable object. It must implement #render_in.` },
      () => view.render({ renderable: object }),
    );
  });

  it("render partial starting with a capital", async () => {
    await assertNothingRaised(() => view.render({ partial: "test/FooBar" }));
  });

  it("render partial with hyphen", async () => {
    await assertNothingRaised(() => view.render({ partial: "test/a-in" }));
  });

  it("render partial with unicode text", async () => {
    await assertNothingRaised(() => view.render({ partial: "test/🍣" }));
  });

  it("render partial with invalid option as", async () => {
    const e = await assertRaises([ArgumentError], {}, () =>
      view.render({ partial: "test/partial_only", as: "a-in", object: null }),
    );
    assertEqual(
      "The value (a-in) of the option `as` is not a valid Ruby identifier; " +
        "make sure it starts with lowercase letter, " +
        "and is followed by any combination of letters, numbers and underscores.",
      e.message,
    );
  });

  it("render partial with hyphen and invalid option as", async () => {
    const e = await assertRaises([ArgumentError], {}, () =>
      view.render({ partial: "test/a-in", as: "a-in", object: null }),
    );
    assertEqual(
      "The value (a-in) of the option `as` is not a valid Ruby identifier; " +
        "make sure it starts with lowercase letter, " +
        "and is followed by any combination of letters, numbers and underscores.",
      e.message,
    );
  });

  it("render object different name", async () => {
    expect(
      chomp(
        String(
          await view.render({
            partial: "test/template_not_named_customer",
            object: new Customer("t.lo"),
            as: "customer",
          }),
        ),
      ),
    ).toBe("Hello: t.lo");
  });

  it("render object with array", async () => {
    expect(String(await view.render({ partial: "test/object_inspector", object: [1, 2, 3] }))).toBe(
      "[1, 2, 3]",
    );
  });

  it("render partial collection", async () => {
    expect(
      String(
        await view.render({
          partial: "test/customer",
          collection: [new Customer("david"), new Customer("mary")],
        }),
      ),
    ).toBe("Hello: davidHello: mary");
  });

  it("render partial collection as by string", async () => {
    expect(
      String(
        await view.render({
          partial: "test/customer_with_var",
          collection: [new Customer("david"), new Customer("mary")],
          as: "customer",
        }),
      ),
    ).toBe("david david davidmary mary mary");
  });

  it("render partial collection as by symbol", async () => {
    expect(
      String(
        await view.render({
          partial: "test/customer_with_var",
          collection: [new Customer("david"), new Customer("mary")],
          as: ":customer",
        }),
      ),
    ).toBe("david david davidmary mary mary");
  });

  it("render partial collection without as", async () => {
    expect(
      String(
        await view.render({ partial: "test/local_inspector", collection: [new Customer("mary")] }),
      ),
    ).toBe("local_inspector,local_inspector_counter,local_inspector_iteration");
  });

  it("render partial with empty collection should return nil", async () => {
    assertNil(await view.render({ partial: "test/customer", collection: [] }));
  });

  it("render partial with nil collection should return nil", async () => {
    assertNil(await view.render({ partial: "test/customer", collection: null }));
  });

  it("render partial without object does not put partial name to local assigns", async () => {
    expect(String(await view.render({ partial: "test/partial_name_in_local_assigns" }))).toBe(
      "false",
    );
  });

  it("render partial with nil object puts partial name to local assigns", async () => {
    expect(
      String(await view.render({ partial: "test/partial_name_in_local_assigns", object: null })),
    ).toBe("true");
  });

  it("render partial with nil values in collection", async () => {
    expect(
      String(
        await view.render({ partial: "test/customer", collection: [new Customer("david"), null] }),
      ),
    ).toBe("Hello: davidHello: Anonymous");
  });

  it("render partial with layout using collection and template", async () => {
    expect(
      String(
        await view.render({
          partial: "test/customer",
          layout: "test/b_layout_for_partial",
          collection: [new Customer("Amazon"), new Customer("Yahoo")],
        }),
      ),
    ).toBe("<b>Hello: Amazon</b><b>Hello: Yahoo</b>");
  });

  it("render partial with layout using collection and template makes current item available in layout", async () => {
    expect(
      String(
        await view.render({
          partial: "test/customer",
          layout: "test/b_layout_for_partial_with_object",
          collection: [new Customer("Amazon"), new Customer("Yahoo")],
        }),
      ),
    ).toBe('<b class="amazon">Hello: Amazon</b><b class="yahoo">Hello: Yahoo</b>');
  });

  it("render partial with layout using collection and template makes current item counter available in layout", async () => {
    expect(
      String(
        await view.render({
          partial: "test/customer",
          layout: "test/b_layout_for_partial_with_object_counter",
          collection: [new Customer("Amazon"), new Customer("Yahoo")],
        }),
      ),
    ).toBe('<b data-counter="0">Hello: Amazon</b><b data-counter="1">Hello: Yahoo</b>');
  });

  it("render partial with layout using object and template makes object available in layout", async () => {
    expect(
      String(
        await view.render({
          partial: "test/customer",
          layout: "test/b_layout_for_partial_with_object",
          object: new Customer("Amazon"),
        }),
      ),
    ).toBe('<b class="amazon">Hello: Amazon</b>');
  });

  it("render partial with empty array should return nil", async () => {
    assertNil(await view.render({ partial: [] }));
  });

  it("render partial with no block given to yield", async () => {
    expect(
      String(await view.render({ partial: "test/layout_for_partial", locals: { name: "Josh" } })),
    ).toBe("Before (Josh)\n\nAfter");
  });

  it("render inline", async () => {
    expect(String(await view.render({ inline: "Hello, World!" }))).toBe("Hello, World!");
  });

  it("render inline with locals", async () => {
    expect(
      String(await view.render({ inline: "Hello, <%= name %>!", locals: { name: "Josh" } })),
    ).toBe("Hello, Josh!");
  });

  it("render body", async () => {
    expect(String(await view.render({ body: "some body" }))).toBe("some body");
  });

  it("render plain", async () => {
    expect(String(await view.render({ plain: "some plaintext" }))).toBe("some plaintext");
  });
  it("implicit format comes from parent template", async () => {
    const renderedTemplates = JSON.parse(
      String(await controllerView.render({ template: "test/mixing_formats" })),
    );
    assertEqual({ format: "HTML", children: ["XML", "HTML"] }, renderedTemplates);
  });

  it("implicit format comes from parent template cascading", async () => {
    const renderedTemplates = JSON.parse(
      String(await controllerView.render({ template: "test/mixing_formats_deep" })),
    );
    assertEqual(
      {
        format: "HTML",
        children: [
          { format: "XML", children: ["XML"] },
          { format: "HTML", children: ["HTML"] },
        ],
      },
      renderedTemplates,
    );
  });

  it("explicit js format adds html fallback", async () => {
    const renderedTemplates = await controllerView.render({
      template: "test/js_html_fallback",
      formats: ":js",
    });
    assertEqual(
      'document.write("<b>Hello from a HTML partial!<\\/b>")\n',
      String(renderedTemplates),
    );
  });

  it("render partial implicitly use format of the rendered partial", async () => {
    view.lookupContext!.formats = [":html"];
    assertEqual("Third level", String(await view.render({ template: "test/html_template" })));
  });

  // BLOCKED: render-test-surfaced-rendering-gaps
  it.skip("render partial use last prepended format for partials with the same names", async () => {
    view.lookupContext!.formats = [":html"];
    assertEqual(
      "\nHTML Template, but HTML partial",
      String(await view.render({ template: "test/change_priority" })),
    );
  });

  it("render template with a missing partial of another format", async () => {
    view.lookupContext!.formats = [":html"];
    const e = await assertRaises([TemplateError], {}, () =>
      view.render({ template: "with_format", formats: [":json"] }),
    );
    const details = {
      locale: [":en"],
      formats: [":json"],
      variants: [],
      handlers: [":raw", ":tse", ":html", ":ruby"],
    };
    assertIncludes(
      e.message,
      `Missing partial /_missing with ${rbInspect(symbolizeKeys(details))}.`,
    );
  });

  // BLOCKED: render-test-surfaced-rendering-gaps
  it.skip("render template with handlers", async () => {
    assertEqual(
      "<h1>No Comment</h1>\n",
      String(await view.render({ template: "comments/empty", handlers: [":builder"] })),
    );
    assertEqual(
      "<h1>No Comment</h1>\n",
      String(await view.render({ template: "comments/empty", handlers: ":builder" })),
    );
  });

  it("render raw template with handlers", async () => {
    assertEqual("<%= hello_world %>\n", String(await view.render({ template: "plain_text" })));
  });

  it("render raw template with quotes", async () => {
    assertEqual(
      "Here are some characters: !@#$%^&*()-=\"'}{`" + "\n",
      String(await view.render({ template: "plain_text_with_characters" })),
    );
  });

  it("render raw is html safe and does not escape output", async () => {
    const buffer = new SafeBuffer();
    buffer.concat(await view.render({ template: "plain_text" }));
    assertEqual(true, buffer.htmlSafe);
    assertEqual("<%= hello_world %>\n", String(buffer));
  });

  // PERMANENT-SKIP: a `.ruby` template is Ruby source. (CLAUDE.md, "Templates are precompiled").
  it.skip("render ruby template with handlers", () => {});

  // PERMANENT-SKIP: `type: :ruby` evaluates Ruby source. (CLAUDE.md, "Templates are precompiled").
  it.skip("render ruby template inline", () => {});

  // PERMANENT-SKIP: `ruby_template` is a `.ruby` template. (CLAUDE.md, "Templates are precompiled").
  it.skip("render template via symbol lookup", () => {});

  it("render template with localization on context level", async () => {
    const oldLocale = view.locale;
    view.locale = "da";
    try {
      assertEqual("Hey verden", String(await view.render({ template: "test/hello_world" })));
    } finally {
      view.locale = oldLocale!;
    }
  });

  it("render template with dashed locale", async () => {
    const oldLocale = view.locale;
    view.locale = "pt-BR";
    try {
      assertEqual("Ola mundo", String(await view.render({ template: "test/hello_world" })));
    } finally {
      view.locale = oldLocale!;
    }
  });

  it("render outside path", async () => {
    assert(await File.isExistAsync(File.expandPath("../test-helpers/abstract-unit.ts", __dir__)));
    await assertRaises([MissingTemplate], {}, () =>
      view.render({ template: "../\\../test-helpers/abstract-unit.ts" }),
    );
  });

  // BLOCKED: render-test-surfaced-rendering-gaps
  it.skip("render template with syntax error", async () => {
    const e = await assertRaises([TemplateError], {}, () =>
      view.render({ template: "test/syntax_error" }),
    );
    assertMatch(/syntax/i, e.message);
    assertEqual("1:    <%= foo(", (e as TemplateError).annotatedSourceCode()[0].trim());
  });

  // BLOCKED: tse-undefined-local-raises-template-error
  it.skip("render runtime error", () => {});

  // BLOCKED: tse-undefined-local-raises-template-error
  it.skip("render location conditional append", () => {});

  // BLOCKED: tse-undefined-local-raises-template-error
  it.skip("render location conditional append 2", () => {});

  it("render renderable does not mask nomethoderror from within render in", async () => {
    const renderable = {
      renderIn(): unknown {
        const nothing: { renderIn(): unknown } | null = null;
        return nothing!.renderIn();
      },
    };
    await assertRaises([TypeError], { match: /renderIn/ }, () =>
      view.render({ renderable: renderable }),
    );
  });

  it("render partial with errors", async () => {
    const e = await assertRaises([TemplateError], {}, () => view.render({ partial: "test/raise" }));
    assertMatch(/doesnt_exist/, e.message);
    assertEqual("", (e as TemplateError).subTemplateMessage());
    assertEqual("1", (e as TemplateError).lineNumber());
    assertEqual("1: <%= doesnt_exist %>", (e as TemplateError).annotatedSourceCode()[0].trim());
    assertEqual("/test/_raise.html.tse", (e as TemplateError).fileName());
  });

  it("render error indentation", async () => {
    const e = await assertRaises([TemplateError], {}, () =>
      view.render({ partial: "test/raise_indentation" }),
    );
    const errorLines = (e as TemplateError).annotatedSourceCode();
    assertMatch(/error\shere/, e.message);
    assertEqual("11", (e as TemplateError).lineNumber());
    assertEqual("     9: <p>Ninth paragraph</p>", errorLines[1]);
    assertEqual("    10: <p>Tenth paragraph</p>", errorLines[2]);
  });

  it("render template with errors", async () => {
    const e = await assertRaises([TemplateError], {}, () =>
      view.render({ template: "test/_raise" }),
    );
    assertMatch(/doesnt_exist/, e.message);
    assertEqual("", (e as TemplateError).subTemplateMessage());
    assertEqual("1", (e as TemplateError).lineNumber());
    assertEqual("1: <%= doesnt_exist %>", (e as TemplateError).annotatedSourceCode()[0].trim());
    assertEqual("/test/_raise.html.tse", (e as TemplateError).fileName());
  });

  it("render sub template with errors", async () => {
    const e = await assertRaises([TemplateError], {}, () =>
      view.render({ template: "test/sub_template_raise" }),
    );
    assertMatch(/doesnt_exist/, e.message);
    assertMatch(
      /Trace of template inclusion: .*test\/sub_template_raise\.html\.tse/,
      (e as TemplateError).subTemplateMessage(),
    );
    assertEqual("1", (e as TemplateError).lineNumber());
    assertEqual("/test/_raise.html.tse", (e as TemplateError).fileName());
  });

  it("undefined method error references named class", async () => {
    const e = await assertRaises([TemplateError], {}, () =>
      view.render({ inline: "<%= undefined_name %>" }),
    );
    assertMatch(/undefined_name/, e.message);
  });

  it("render renderable object", async () => {
    assertEqual(
      "Hello: david",
      String(await view.render({ partial: "test/customer", object: new Customer("david") })),
    );
    assertEqual("FalseClass", String(await view.render({ partial: "test/klass", object: false })));
    assertEqual("NilClass", String(await view.render({ partial: "test/klass", object: null })));
  });

  it("render renderable render in", async () => {
    assertEqual("Hello, World!", String(await view.render(new TestRenderable())));
    assertEqual("Hello, World!", String(await view.render({ renderable: new TestRenderable() })));
  });

  it("render partial collection with different partials still provides partial iteration", async () => {
    const a = { toPartialPath: () => "test/partial_iteration_1" };
    const b = { toPartialPath: () => "test/partial_iteration_2" };
    assertEqual("local-variable\nlocal-variable", String(await controllerView.render([a, b])));
  });

  it("render partial collection for non array", async () => {
    const customers = (function* () {
      yield new Customer("david");
      yield new Customer("mary");
    })();
    assertEqual(
      "Hello: davidHello: mary",
      String(await view.render({ partial: "test/customer", collection: customers })),
    );
  });

  // BLOCKED: render-test-surfaced-rendering-gaps
  it.skip("without compiled method container is deprecated", async () => {
    const view = Base.withViewPaths(ActionController.Base.viewPaths());
    await assertRaises([NotImplementedError], {}, () =>
      view.render({ template: "test/hello_world" }),
    );
  });

  it("render partial using string", async () => {
    assertEqual("Hello: Anonymous", String(await controllerView.render("customer")));
  });

  it("render partial with locals using string", async () => {
    assertEqual(
      "Hola: david",
      String(
        await controllerView.render("customer_greeting", {
          greeting: "Hola",
          customer_greeting: new Customer("david"),
        }),
      ),
    );
  });

  it("render partial with object uses render partial path", async () => {
    assertEqual(
      "Hello: lifo",
      String(
        await controllerView.render({
          partial: new Customer("lifo"),
          locals: { greeting: "Hello" },
        }),
      ),
    );
  });

  it("render partial with object and format uses render partial path", async () => {
    assertEqual(
      "<greeting>Hello</greeting><name>lifo</name>",
      String(
        await controllerView.render({
          partial: new Customer("lifo"),
          formats: ":xml",
          locals: { greeting: "Hello" },
        }),
      ),
    );
  });

  it("render partial using object", async () => {
    assertEqual(
      "Hello: lifo",
      String(await controllerView.render(new Customer("lifo"), { greeting: "Hello" })),
    );
  });

  it("render partial using collection", async () => {
    const customers = [new Customer("Amazon"), new Customer("Yahoo")];
    assertEqual(
      "Hello: AmazonHello: Yahoo",
      String(await controllerView.render(customers, { greeting: "Hello" })),
    );
  });

  it("render partial using collection without path", async () => {
    assertEqual(
      "hi good customer: david0",
      String(await controllerView.render([new GoodCustomer("david")], { greeting: "hi" })),
    );
  });

  it("render partial without object or collection does not generate partial name local variable", async () => {
    const exception = await assertRaises([TemplateError], {}, () =>
      controllerView.render("partial_name_local_variable"),
    );
    assertInstanceOf(ReferenceError, exception.cause);
    assertEqual(
      "partial_name_local_variable",
      (exception.cause as ReferenceError).message.replace(/ is not defined$/u, ""),
    );
  });

  it("render partial with non existent format and raise missing template", async () => {
    view.formats = [":xml"];
    try {
      await assertRaises([MissingTemplate], {}, () =>
        view.render({ partial: "test/layout_for_partial" }),
      );
    } finally {
      view.formats = null;
    }
  });

  it("render layout with block and other partial inside", async () => {
    const render = await view.render(
      { layout: "test/layout_with_partial_and_yield" },
      {},
      () => "Yield!",
    );
    assertEqual("Before\npartial html\nYield!\nAfter\n", String(render));
  });

  it("render fallbacks to erb for unknown types", async () => {
    assertEqual(
      "Hello, World!",
      String(await view.render({ inline: "Hello, World!", type: ":bar" })),
    );
  });

  // PERMANENT-SKIP: the handler returns Ruby source for `module_eval`. (CLAUDE.md, "Templates are precompiled").
  it.skip("render inline with render from to proc", () => {});

  // PERMANENT-SKIP: the handler returns Ruby source for `module_eval`. (CLAUDE.md, "Templates are precompiled").
  it.skip("optional second arg works without deprecation", () => {});

  // PERMANENT-SKIP: `CustomHandler` returns Ruby source for `module_eval`. (CLAUDE.md, "Templates are precompiled").
  it.skip("render inline with compilable custom type", () => {});

  // PERMANENT-SKIP: `CustomHandler` returns Ruby source for `module_eval`. (CLAUDE.md, "Templates are precompiled").
  it.skip("render inline with locals and compilable custom type", () => {});

  it("render knows about types registered when extensions are checked earlier in initialization", () => {
    TemplateHandlers.extensions();
    TemplateHandlers.registerTemplateHandler("foo", CustomHandler);
    try {
      assertIncludes(TemplateHandlers.extensions(), ":foo");
    } finally {
      TemplateHandlers.unregisterTemplateHandler("foo");
    }
  });

  it("render does not use unregistered extension and template handler", async () => {
    TemplateHandlers.registerTemplateHandler("foo", CustomHandler);
    TemplateHandlers.unregisterTemplateHandler("foo");
    assertNot(TemplateHandlers.extensions().includes(":foo"));
    assertEqual(
      "Hello, World!",
      String(await view.render({ inline: "Hello, World!", type: ":foo" })),
    );
  });

  it("render ignores templates with malformed template handlers", async () => {
    for (const name of [
      "malformed",
      "malformed.tse",
      "malformed.html.tse",
      "malformed.en.html.tse",
    ]) {
      assert(
        Object.hasOwn(fixtures, `test/malformed/${name}~`),
        `Malformed file (${name}~) which should be ignored does not exists`,
      );
      await assertRaises([MissingTemplate], {}, () =>
        view.render({ template: `test/malformed/${name}` }),
      );
    }
  });

  it("render with layout", async () => {
    assertEqual(
      "<title></title>\nHello world!\n",
      String(await view.render({ template: "test/hello_world", layout: "layouts/yield" })),
    );
  });

  it("render with layout which has render inline", async () => {
    assertEqual(
      "welcome\nHello world!\n",
      String(
        await view.render({
          template: "test/hello_world",
          layout: "layouts/yield_with_render_inline_inside",
        }),
      ),
    );
  });

  it("render with layout which renders another partial", async () => {
    assertEqual(
      "partial html\nHello world!\n",
      String(
        await view.render({
          template: "test/hello_world",
          layout: "layouts/yield_with_render_partial_inside",
        }),
      ),
    );
  });

  it("render partial with html only extension", async () => {
    assertEqual(
      "<h1>partial html</h1>\nHello world!\n",
      String(
        await view.render({ template: "test/hello_world", layout: "layouts/render_partial_html" }),
      ),
    );
  });

  it("render layout with block and yield", async () => {
    assertEqual(
      "Content from block!\n",
      String(await view.render({ layout: "layouts/yield_only" }, {}, () => "Content from block!")),
    );
  });

  it("render layout with block and yield with params", async () => {
    assertEqual(
      "Yield! Content from block!\n",
      String(
        await view.render(
          { layout: "layouts/yield_with_params" },
          {},
          ((param: string) => `${param} Content from block!`) as () => unknown,
        ),
      ),
    );
  });

  it("render layout with block which renders another partial and yields", async () => {
    assertEqual(
      "partial html\nContent from block!\n",
      String(
        await view.render({ layout: "layouts/partial_and_yield" }, {}, () => "Content from block!"),
      ),
    );
  });

  it("render partial and layout without block with locals", async () => {
    assertEqual(
      "Before (Foo!)\npartial html\nAfter",
      String(
        await view.render({
          partial: "test/partial",
          layout: "test/layout_for_partial",
          locals: { name: "Foo!" },
        }),
      ),
    );
  });

  it("render partial and layout without block with locals and rendering another partial", async () => {
    assertEqual(
      "Before (Foo!)\npartial html\npartial with partial\n\nAfter",
      String(
        await view.render({
          partial: "test/partial_with_partial",
          layout: "test/layout_for_partial",
          locals: { name: "Foo!" },
        }),
      ),
    );
  });

  it("render partial shortcut with block content", async () => {
    assertEqual(
      "Before (shortcut test)\nBefore\n\n  Yielded: arg1/arg2\n\nAfter\nAfter",
      String(
        await view.render({
          partial: "test/partial_shortcut_with_block_content",
          layout: "test/layout_for_partial",
          locals: { name: "shortcut test" },
        }),
      ),
    );
  });

  it("render layout with a nested render layout call", async () => {
    assertEqual(
      "Before (Foo!)\nBefore (Bar!)\npartial html\nAfter\npartial with layout\n\nAfter",
      String(
        await view.render({
          partial: "test/partial_with_layout",
          layout: "test/layout_for_partial",
          locals: { name: "Foo!" },
        }),
      ),
    );
  });

  // BLOCKED: render-test-surfaced-rendering-gaps
  it.skip("render layout with a nested render layout call using block with render partial", async () => {
    assertEqual(
      "Before (Foo!)\nBefore (Bar!)\n\n  partial html\n\nAfterpartial with layout\n\nAfter",
      String(
        await view.render({
          partial: "test/partial_with_layout_block_partial",
          layout: "test/layout_for_partial",
          locals: { name: "Foo!" },
        }),
      ),
    );
  });

  it("render layout with a nested render layout call using block with render content", async () => {
    assertEqual(
      "Before (Foo!)\nBefore (Bar!)\n\n  Content from inside layout!\n\nAfterpartial with layout\n\nAfter",
      String(
        await view.render({
          partial: "test/partial_with_layout_block_content",
          layout: "test/layout_for_partial",
          locals: { name: "Foo!" },
        }),
      ),
    );
  });

  it("render partial with layout raises descriptive error", async () => {
    const e = await assertRaises([MissingTemplate], {}, () =>
      view.render(Object.assign({ partial: "test/partial" }, { layout: true })),
    );
    assertMatch("Missing partial /_true with", e.message);
  });

  it("render partial provides spellcheck", async () => {
    const e = await assertRaises([MissingTemplate], {}, () =>
      view.render({ partial: "test/partail" }),
    );
    assertMatch(
      /Did you mean\? {2}test\/partial/,
      (e as MissingTemplate & { detailedMessage(): string }).detailedMessage(),
    );
  });

  it("spellcheck doesnt list directories", async () => {
    const e = await assertRaises([MissingTemplate], {}, () =>
      view.render({ partial: "test/directory" }),
    );
    assertMatch(
      /Did you mean\?/,
      (e as MissingTemplate & { detailedMessage(): string }).detailedMessage(),
    );
    assertNoMatch(
      /Did you mean\? {2}test\/directory\n/,
      (e as MissingTemplate & { detailedMessage(): string }).detailedMessage(),
    );
  });

  it("spellcheck only lists templates", async () => {
    const e = await assertRaises([MissingTemplate], {}, () =>
      view.render({ template: "test/partial" }),
    );
    assertMatch(
      /Did you mean\?/,
      (e as MissingTemplate & { detailedMessage(): string }).detailedMessage(),
    );
    assertNoMatch(
      /Did you mean\? {2}test\/partial\n/,
      (e as MissingTemplate & { detailedMessage(): string }).detailedMessage(),
    );
  });

  it("spellcheck only lists partials", async () => {
    const e = await assertRaises([MissingTemplate], {}, () =>
      view.render({ partial: "test/template" }),
    );
    assertMatch(
      /Did you mean\?/,
      (e as MissingTemplate & { detailedMessage(): string }).detailedMessage(),
    );
    assertNoMatch(
      /Did you mean\? {2}test\/template\n/,
      (e as MissingTemplate & { detailedMessage(): string }).detailedMessage(),
    );
  });

  it("render partial wrong details no spellcheck", async () => {
    const e = await assertRaises([MissingTemplate], {}, () =>
      view.render({ partial: "test/partial_with_only_html_version", formats: [":xml"] }),
    );
    assertNoMatch(
      /Did you mean\?/,
      (e as MissingTemplate & { detailedMessage(): string }).detailedMessage(),
    );
  });

  // BLOCKED: render-test-surfaced-rendering-gaps
  it.skip("render with nested layout", async () => {
    assertEqual(
      '<title>title</title>\n\n<div id="column">column</div>\n<div id="content">content</div>\n',
      String(await view.render({ template: "test/nested_layout", layout: "layouts/yield" })),
    );
  });

  it("render with file in layout", async () => {
    assertEqual(
      "\n<title>title</title>\n\n",
      String(await view.render({ template: "test/layout_render_file" })),
    );
  });

  it("render layout with object", async () => {
    assertEqual(
      "<title>David</title>",
      String(await view.render({ template: "test/layout_render_object" })),
    );
  });

  // PERMANENT-SKIP: `CustomHandler` returns Ruby source for `module_eval`. (CLAUDE.md, "Templates are precompiled").
  it.skip("render with passing couple extensions to one register template handler function call", async () => {
    TemplateHandlers.registerTemplateHandler("foo1", "foo2", CustomHandler);
    try {
      assertEqual(
        String(await view.render({ inline: "Hello, World!", type: ":foo1" })),
        String(await view.render({ inline: "Hello, World!", type: ":foo2" })),
      );
    } finally {
      TemplateHandlers.unregisterTemplateHandler("foo1", "foo2");
    }
  });

  it("render throws exception when no extensions passed to register template handler function call", async () => {
    await assertRaises([ArgumentError], {}, () =>
      TemplateHandlers.registerTemplateHandler(CustomHandler),
    );
  });

  it("render object", async () => {
    assertEqual("Hello, World!", String(await view.render(new TestRenderable())));
  });

  // PERMANENT-SKIP: `type: :ruby` evaluates Ruby source, and a JS string has no in-place `<<`. (CLAUDE.md, "Templates are precompiled"; CLAUDE.md, "Ruby Strings are JS string primitives").
  it.skip("render mutate string literal", () => {});

  // BLOCKED: render-test-surfaced-rendering-gaps
  it.skip("cache fragments inside render layout call with block", async () => {
    const cat = await view.render({ template: "test/cache_fragment_inside_render_layout_block_1" });
    const dog = await view.render({ template: "test/cache_fragment_inside_render_layout_block_2" });
    assertNotEqual(String(cat), String(dog));
  });

  it("caching predicate method", async () => {
    const result = await view.render({ template: "test/caching_predicate" });
    assertMatch("Cached!", String(result));
  });

  it("caching predicate method outside of cache", async () => {
    const result = await view.render({ template: "test/caching_predicate_outside_cache" });
    assertMatch("Not cached!", String(result));
  });

  it("uncacheable", async () => {
    const e = await assertRaises([TemplateError], {}, () =>
      view.render({ template: "test/uncacheable" }),
    );
    assertMatch("can't be fragment cached", (e.cause as Error).message);
  });
});

describe("FrozenStringLiteralEnabledViewRenderTest", () => {
  // PERMANENT-SKIP: `type: :ruby` evaluates Ruby source, and a JS string is always frozen. (CLAUDE.md, "Templates are precompiled"; CLAUDE.md, "Ruby Strings are JS string primitives").
  it.skip("render mutate string literal", () => {});
});

describe("LazyViewRenderTest", () => {
  // PERMANENT-SKIP: a String has no encoding tag and Node has no `Encoding.default_external`. (CLAUDE.md, "A String has no encoding tag either").
  it.skip("render utf8 template with magic comment", () => {});

  // PERMANENT-SKIP: a String has no encoding tag and Node has no `Encoding.default_external`. (CLAUDE.md, "A String has no encoding tag either").
  it.skip("render utf8 template with default external encoding", () => {});

  // PERMANENT-SKIP: a String has no encoding tag and Node has no `Encoding.default_external`. (CLAUDE.md, "A String has no encoding tag either").
  it.skip("render utf8 template with incompatible external encoding", () => {});

  // PERMANENT-SKIP: a String has no encoding tag and Node has no `Encoding.default_external`. (CLAUDE.md, "A String has no encoding tag either").
  it.skip("render utf8 template with partial with incompatible encoding", () => {});
});

describe("CachedCollectionViewRenderTest", () => {
  class CachedCustomer extends Customer {}

  beforeEach(() => {
    PartialRenderer.setCollectionCache(new MemoryStore());
    ActionController.Base.viewPaths([resolver]);
    setupView(ActionController.Base.viewPaths());
  });

  afterEach(teardown);

  it("template body written to cache", async () => {
    const customer = new Customer("david", 1);
    const key = cacheKey(customer, "test/_customer");
    assertNil(await PartialRenderer.collectionCache().read(key));
    await view.render({ partial: "test/customer", collection: [customer], cached: true });
    assertEqual("Hello: david", String(await PartialRenderer.collectionCache().read(key)));
  });

  it("collection caching does not cache by default", async () => {
    const customer = new Customer("david", 1);
    const key = cacheKey(customer, "test/_customer");

    await PartialRenderer.collectionCache().write(key, "Cached");

    assertNotEqual(
      "Cached",
      String(await view.render({ partial: "test/customer", collection: [customer] })),
    );
  });

  it("collection caching does not cache if controller doesn't respond to perform_caching", async () => {
    view.controller = null;

    const customer = new Customer("david", 1);
    const key = cacheKey(customer, "test/_customer");

    await PartialRenderer.collectionCache().write(key, "Cached");

    assertNotEqual(
      "Cached",
      String(await view.render({ partial: "test/customer", collection: [customer], cached: true })),
    );
  });

  it("collection caching does not cache if perform_caching is disabled", async () => {
    view.controller!.performCaching = false;

    const customer = new Customer("david", 1);
    const key = cacheKey(customer, "test/_customer");

    await PartialRenderer.collectionCache().write(key, "Cached");

    assertNotEqual(
      "Cached",
      String(await view.render({ partial: "test/customer", collection: [customer], cached: true })),
    );
  });

  it("collection caching with partial that doesn't use fragment caching", async () => {
    const customer = new Customer("david", 1);
    const key = cacheKey(customer, "test/_customer");

    await PartialRenderer.collectionCache().write(key, "Cached");

    assertEqual(
      "Cached",
      String(await view.render({ partial: "test/customer", collection: [customer], cached: true })),
    );
  });

  it("collection caching with cached true", async () => {
    const customer = new CachedCustomer("david", 1);
    const key = cacheKey(customer, "test/_cached_customer");

    await PartialRenderer.collectionCache().write(key, "Cached");

    assertEqual(
      "Cached",
      String(
        await view.render({
          partial: "test/cached_customer",
          collection: [customer],
          cached: true,
        }),
      ),
    );
  });

  it("collection caching does not work on multi-partials", async () => {
    const a = { toPartialPath: () => "test/partial_iteration_1" };
    const b = { toPartialPath: () => "test/partial_iteration_2" };

    await assertRaises([NotImplementedError], {}, () =>
      controllerView.render({ partial: [a, b], cached: true }),
    );
  });

  it("collection caching with empty collection and logger with level debug", async () => {
    (PartialRenderer.collectionCache() as MemoryStore).logger = new Logger(null, {
      level: ":debug",
    });

    assertNil(await view.render({ partial: "test/cached_customer", collection: [], cached: true }));
  });

  it("collection caching with repeated collection", async () => {
    const sets = [
      [1, 2, 3, 4, 5],
      [1, 2, 3, 4, 4],
      [1, 2, 3, 4, 5],
      [1, 2, 3, 4, 4],
      [1, 2, 3, 4, 6],
    ];

    const result = await view.render({
      partial: "test/cached_set",
      collection: sets,
      cached: true,
    });

    const splitedResult = stringSplit(String(result), "\n");
    assertEqual(5, splitedResult.length);
    assertEqual(
      [
        "1 | 2 | 3 | 4 | 5",
        "1 | 2 | 3 | 4 | 4",
        "1 | 2 | 3 | 4 | 5",
        "1 | 2 | 3 | 4 | 4",
        "1 | 2 | 3 | 4 | 6",
      ],
      splitedResult,
    );
  });
});
