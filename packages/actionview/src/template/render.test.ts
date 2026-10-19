import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Mime } from "@blazetrails/actionpack";

import { Base } from "../base.js";
import { Template } from "../template.js";
import { LookupContext } from "../lookup-context.js";
import { TemplateHandlers } from "./handlers.js";
import { Tse } from "./handlers/tse.js";
import { FixtureResolver } from "../testing/resolvers.js";
import { assertNil, assertNothingRaised, assertRaises } from "@blazetrails/activesupport";
import { ArgumentError, File, chomp, rbInspect } from "@blazetrails/ruby-compat";
import { MissingTemplate } from "./error.js";

Template.mimeTypesImplementation = Mime;

const __dir__ = new URL(".", import.meta.url).pathname;

class Customer {
  constructor(readonly name: string) {}
}

describe("CachedViewRenderTest", () => {
  let view: Base;

  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    const resolver = new FixtureResolver({
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
    });
    const lookupContext = new LookupContext(null, {}, []);
    lookupContext.appendViewPaths([resolver]);
    view = new (Base.withEmptyTemplateCache())(lookupContext, { secret: "in the sauce" }, null);
  });

  afterEach(() => {
    TemplateHandlers.clear();
  });

  it("render without options", async () => {
    const e = await assertRaises([ArgumentError], {}, () => view.render({}));
    expect(e.message).toMatch(/You invoked render but did not give any of (.+) option\./);
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
    expect(e.message).toMatch(/File (.+) does not exist/);
  });

  it("render file with invalid full path", async () => {
    const templatePath = File.expandPath("./fixtures/test/hello_world_invalid.tse", __dir__);
    const e = await assertRaises([ArgumentError], {}, () => view.render({ file: templatePath }));
    expect(e.message).toMatch(/File (.+) does not exist/);
  });

  it("render file with relative path", async () => {
    const templatePath = "fixtures/test/hello_world.tse";
    const e = await assertRaises([ArgumentError], {}, () => view.render({ file: templatePath }));
    expect(e.message).toMatch(
      /`render file:` should be given the absolute path to a file. (.+) was given instead/,
    );
  });

  it("render template with format", async () => {
    expect(String(await view.render({ template: "comments/empty", formats: [":html"] }))).toContain(
      "<h1>No Comment</h1>",
    );
    expect(String(await view.render({ template: "comments/empty", formats: [":xml"] }))).toContain(
      "<error>No Comment</error>",
    );
    expect(String(await view.render({ template: "comments/empty", formats: ":xml" }))).toContain(
      "<error>No Comment</error>",
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
    const e = await assertRaises([ArgumentError], {}, () =>
      view.render({ partial: null as never }),
    );
    expect(e.message).toContain(
      "'nil' is not an ActiveModel-compatible object. It must implement #to_partial_path.",
    );
  });

  it("render renderable with nil", async () => {
    const e = await assertRaises([ArgumentError], {}, () => view.render({ renderable: null }));
    expect(e.message).toContain("'nil' is not a renderable object. It must implement #render_in.");
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
    expect(e.message).toBe(
      "The value (a-in) of the option `as` is not a valid Ruby identifier; " +
        "make sure it starts with lowercase letter, " +
        "and is followed by any combination of letters, numbers and underscores.",
    );
  });

  it("render partial with hyphen and invalid option as", async () => {
    const e = await assertRaises([ArgumentError], {}, () =>
      view.render({ partial: "test/a-in", as: "a-in", object: null }),
    );
    expect(e.message).toBe(
      "The value (a-in) of the option `as` is not a valid Ruby identifier; " +
        "make sure it starts with lowercase letter, " +
        "and is followed by any combination of letters, numbers and underscores.",
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
    assertNil(await view.render({ partial: "test/customer", collection: null as never }));
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
    assertNil(await view.render({ partial: [] as never }));
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
});
