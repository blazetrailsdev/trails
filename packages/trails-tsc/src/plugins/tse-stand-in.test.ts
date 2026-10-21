import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript-5";
import {
  Base,
  FixtureResolver,
  LookupContext,
  OutputBuffer,
  Template,
  TemplateHandlers,
  TopLevel,
  TseHandler,
} from "@blazetrails/actionview";
import { tseLookupTransformer, virtualizeTse } from "./tse.js";

// @ts-expect-error -- Property 'glob' does not exist on type 'ImportMeta'
const globbed: Record<string, string> = import.meta.glob(
  ["../../../actionview/src/test-helpers/fixtures/**/*.tse"],
  { query: "?raw", import: "default", eager: true },
);
const fixtures = Object.fromEntries(
  Object.entries(globbed).map(([file, src]) => [file.split("/fixtures/")[1], src]),
);

type StandIn = (this: object, context: object, locals: object, _?: unknown) => Promise<unknown>;

function standIn(source: string): StandIn {
  const js = ts.transpileModule(virtualizeTse(source, { view: "any" }), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    transformers: { before: [tseLookupTransformer] },
  }).outputText;
  const body = js
    .replace('import { TopLevel } from "@blazetrails/actionview";', "")
    .replace("export default async function render(", "return async function render(");
  return new Function("TopLevel", body)(TopLevel) as StandIn;
}

const ACTIONPACK = "actionpack/";

const customer = (name: string, path = "customers/customer") => ({
  name,
  toPartialPath: () => path,
});

const SCENARIOS: Record<string, (view: Base) => unknown> = {
  "test/hello_world": (view) => view.render({ template: "test/hello_world" }),
  "test/hello-world": (view) => view.render({ template: "test/hello-world" }),
  "override/test/hello-world": (view) => view.render({ template: "override/test/hello-world" }),
  "test/_partial": (view) => view.render({ partial: "test/partial" }),
  "test/_customer": (view) =>
    view.render({ partial: "test/customer", locals: { customer: customer("david") } }),
  "topics/_topic": (view) =>
    view.render({ partial: "topics/topic", locals: { topic: { title: "Rails" } } }),
  "customers/_customer": (view) =>
    view.render({
      partial: "customers/customer",
      collection: [customer("david"), customer("mary")],
      locals: { greeting: "hi" },
    }),
  "good-customers/_good_customer": (view) =>
    view.render({
      partial: [
        customer("david", "good-customers/good_customer"),
        customer("mary", "good_customers/good_customer"),
      ],
      locals: { greeting: "hi" },
    }),
  "layouts/yield": (view) => view.render({ template: "test/hello_world", layout: "layouts/yield" }),
  "layouts/_yield_only": (view) =>
    view.viewRenderer.renderPartial(view, { partial: "layouts/yield_only" }, () => "from block"),
  "override2/layouts/test/sub": (view) =>
    view.render({ template: "test/hello_world", layout: "override2/layouts/test/sub" }),
  "test/_cached_customer": (view) =>
    view.render({ partial: "test/cached_customer", locals: { cached_customer: customer("d") } }),
  "test/_nested_cached_customer": (view) =>
    view.render({
      partial: "test/nested_cached_customer",
      locals: { cached_customer: customer("d") },
    }),
  "test/_cached_nested_cached_customer": (view) =>
    view.render({
      partial: "test/cached_nested_cached_customer",
      locals: { cached_customer: customer("d") },
    }),
  "developers/_developer": (view) =>
    view.render({ partial: "developers/developer", locals: { developer: { name: "Eloy" } } }),
  "developers/_developer.json": (view) =>
    view.render({
      partial: "developers/developer",
      formats: ":json",
      locals: { developer: { name: "Eloy" } },
    }),
  "developers/_developer_with_h1": (view) =>
    view.render({
      partial: "developers/developer_with_h1",
      locals: { developer: { name: "Eloy" } },
    }),
  "test/_from_helper": (view) => {
    Object.assign(view, { renderFromHelper: () => "from helper" });
    return view.render({ partial: "test/from_helper" });
  },
  "test/_layout_for_partial": (view) =>
    view.viewRenderer.renderPartial(
      view,
      { partial: "test/layout_for_partial", locals: { name: "Josh" } },
      () => "from block",
    ),
  "test/render_template_with_ivar": (view) => {
    Object.assign(view, { secret: "in the sauce" });
    return view.render({ template: "test/render_template_with_ivar" });
  },
  "test/dot.directory/render_template_with_ivar": (view) => {
    Object.assign(view, { secret: "in the sauce" });
    return view.render({ template: "test/dot.directory/render_template_with_ivar" });
  },
  "test/list": (view) => {
    Object.assign(view, { customers: [customer("david"), customer("mary")] });
    return view.render({ template: "test/list" });
  },
};

const yieldBlock = (name?: string) => (name === undefined ? "Content from block!" : `<${name}>`);
const form = { label: (method: string) => `<label for="post_${method}">${method}</label>` };
const assigns = (view: Base, ivars: object, scenario: () => unknown) => {
  Object.assign(view, ivars);
  return scenario();
};
const template =
  (path: string, extra: object = {}) =>
  (view: Base) =>
    view.render({ template: path, ...extra });
const partial =
  (path: string, extra: object = {}) =>
  (view: Base) =>
    view.render({ partial: path, ...extra });
const layout =
  (path: string, block: (name?: string) => unknown = yieldBlock) =>
  (view: Base) =>
    view.render({ layout: path }, {}, block as () => unknown);

const ACTIONPACK_SCENARIOS: Record<string, (view: Base) => unknown> = {
  "bad-customers/_bad_customer": partial("bad-customers/bad_customer", {
    collection: [customer("david", "bad-customers/bad_customer")],
    locals: { greeting: "Bonjour" },
  }),
  "customers/_customer": partial("customers/customer", {
    collection: [customer("david"), customer("mary")],
    locals: { greeting: "Hello" },
  }),
  "fun/games/_form": partial("fun/games/form", { locals: { form } }),
  "fun/games/hello-world": template("fun/games/hello-world"),
  "good-customers/_good_customer": partial("good-customers/good_customer", {
    collection: [customer("david", "good-customers/good_customer")],
    locals: { greeting: "Bonjour" },
  }),
  "layouts/block_with_layout": template("test/hello-world", {
    layout: "layouts/block_with_layout",
  }),
  "layouts/_column": layout("layouts/column", (name) => (name === "column" ? "Column" : "Content")),
  "layouts/_customers": layout(
    "layouts/customers",
    (person) => `Hello ${(person as unknown as { name: string }).name}`,
  ),
  "layouts/_partial_and_yield": layout("layouts/partial_and_yield"),
  "layouts/partial_with_layout": template("test/hello-world", {
    layout: "layouts/partial_with_layout",
  }),
  "layouts/standard": (view) =>
    assigns(view, { variableForLayout: "{ivar}" }, () =>
      view.render({ template: "test/hello-world", layout: "layouts/standard" }),
    ),
  "layouts/standard.text": (view) =>
    assigns(view, { variableForLayout: "{ivar}" }, () =>
      view.render({ template: "layouts/standard", formats: ":text" }),
    ),
  "layouts/streaming": template("test/content_for_with_parameter", { layout: "layouts/streaming" }),
  "layouts/talk_from_action": template("test/action-talk-to-layout", {
    layout: "layouts/talk_from_action",
  }),
  "layouts/with_html_partial": template("test/hello-world", {
    layout: "layouts/with_html_partial",
  }),
  "layouts/xhr": template("test/hello-world", { layout: "layouts/xhr" }),
  "layouts/_yield_only": layout("layouts/yield_only"),
  "layouts/yield": template("test/content_for_with_parameter", { layout: "layouts/yield" }),
  "layouts/_yield_with_params": layout(
    "layouts/yield_with_params",
    (param) => `${param} Content from block!`,
  ),
  "layouts/yield_with_render_inline_inside": template("test/hello-world", {
    layout: "layouts/yield_with_render_inline_inside",
  }),
  "layouts/yield_with_render_partial_inside": template("test/hello-world", {
    layout: "layouts/yield_with_render_partial_inside",
  }),
  "layout_tests/alt/layouts/alt": template("layout_tests/alt/layouts/alt"),
  "layout_tests/layouts/controller_name_space/nested": template("layout_tests/views/hello", {
    layout: "layout_tests/layouts/controller_name_space/nested",
  }),
  "layout_tests/layouts/item": template("layout_tests/views/hello", {
    layout: "layout_tests/layouts/item",
  }),
  "layout_tests/layouts/layout_test": template("layout_tests/views/goodbye", {
    layout: "layout_tests/layouts/layout_test",
  }),
  "layout_tests/layouts/multiple_extensions": template("layout_tests/views/hello", {
    layout: "layout_tests/layouts/multiple_extensions",
  }),
  "layout_tests/layouts/symlinked/symlinked_layout": template("layout_tests/views/hello", {
    layout: "layout_tests/layouts/symlinked/symlinked_layout",
  }),
  "layout_tests/views/goodbye": template("layout_tests/views/goodbye"),
  "layout_tests/views/hello": template("layout_tests/views/hello"),
  "quiz/questions/_question": partial("quiz/questions/question", {
    locals: { question: { name: "first" } },
  }),
  shared: template("shared"),
  "test/action-talk-to-layout": template("test/action-talk-to-layout"),
  "test/calling-partial-with-layout": template("test/calling-partial-with-layout"),
  "test/capturing": template("test/capturing"),
  "test/change_priority": template("test/change_priority"),
  "test/_changing_priority": partial("test/changing_priority"),
  "test/_changing_priority.json": partial("test/changing_priority", { formats: ":json" }),
  "test/content_for_concatenated": template("test/content_for_concatenated", {
    layout: "layouts/yield",
  }),
  "test/content-for": template("test/content-for", { layout: "layouts/yield" }),
  "test/content_for_with_parameter": template("test/content_for_with_parameter"),
  "test/_counter": partial("test/counter", { locals: { counter_counter: 5 } }),
  "test/_customer_counter": partial("test/customer_counter", {
    collection: [customer("david"), customer("mary")],
  }),
  "test/_customer_counter_with_as": partial("test/customer_counter_with_as", {
    collection: [customer("david"), customer("mary")],
    as: "client",
  }),
  "test/_customer_greeting": (view) =>
    view.render("test/customer_greeting", {
      greeting: "Hola",
      customer_greeting: customer("david"),
    }),
  "test/_customer_iteration": partial("test/customer_iteration", {
    collection: [customer("david"), customer("mary"), customer("amazon")],
  }),
  "test/_customer_iteration_with_as": partial("test/customer_iteration_with_as", {
    collection: [customer("david"), customer("mary"), customer("amazon")],
    as: "client",
  }),
  "test/_customer": partial("test/customer", { locals: { customer: customer("david") } }),
  "test/_customer_with_var": partial("test/customer_with_var", {
    collection: [customer("david"), customer("mary")],
    as: "customer",
  }),
  "test/_directory/_partial_with_locales": template("test/render_partial_inside_directory"),
  "test/dot.directory/render_template_with_ivar": (view) =>
    assigns(
      view,
      { secret: "in the sauce" },
      template("test/dot.directory/render_template_with_ivar").bind(null, view),
    ),
  "test/_first_json_partial.json": partial("test/first_json_partial", { formats: ":json" }),
  "test/formatted-html-erb": template("test/formatted-html-erb"),
  "test/formatted-xml-erb": template("test/formatted-xml-erb"),
  "test/formatted-xml-erb.xml": template("test/formatted-xml-erb", { formats: ":xml" }),
  "test/_form": partial("test/form", { locals: { form } }),
  "test/greeting": template("test/greeting"),
  "test/greeting.xml": template("test/with_xml_template"),
  "test/_hash_greeting": partial("test/hash_greeting", {
    collection: [{ first_name: "Pratik" }, { first_name: "Amy" }],
    as: "hash_greeting",
    locals: { greeting: "Hello" },
  }),
  "test/_hash_object": partial("test/hash_object", {
    object: { first_name: "Sam" },
    as: "hash_object",
  }),
  "test/hello/hello": template("test/hello/hello"),
  "test/hello,world": template("test/hello,world"),
  "test/hello-world": template("test/hello-world"),
  "test/hello-world-with-layout-false": template("test/hello-world-with-layout-false"),
  "test/hello_world_with_partial": template("test/hello_world_with_partial"),
  "test/html_template": template("test/html_template"),
  "test/hyphen-ated": template("test/hyphen-ated"),
  "test/_json_change_priority.json": partial("test/json_change_priority", { formats: ":json" }),
  "test/_labelling_form": partial("test/labelling_form", { locals: { labelling_form: form } }),
  "test/_layout_for_partial": template("test/calling-partial-with-layout"),
  "test/list": (view) =>
    assigns(view, { customers: [customer("david", "test/customer")] }, () =>
      view.render({ template: "test/list" }),
    ),
  "test/_partial_for_use_in_layout": template("test/calling-partial-with-layout"),
  "test/_partial_html_erb": partial("test/partial_html_erb"),
  "test/_partial": partial("test/partial"),
  "test/_partial.js": partial("test/partial", { formats: ":js" }),
  "test/_partial_name_local_variable": partial("test/partial_name_local_variable", {
    locals: { partial_name_local_variable: "local" },
  }),
  "test/_partial-only": partial("test/partial-only"),
  "test/_partial_only": template("test/with_partial"),
  "test/_partial_with_partial": partial("test/partial_with_partial"),
  "test/_person": template("test/potential-conflicts"),
  "test/potential-conflicts": (view) =>
    assigns(view, { name: "Jim" }, () =>
      view.render({ template: "test/potential-conflicts", locals: { name: "Jim" } }),
    ),
  "test/proper_block_detection": (view) =>
    assigns(view, { todo: "some todo" }, () =>
      view.render({ template: "test/proper_block_detection" }),
    ),
  "test/raise": template("test/raise"),
  "test/_raise_indentation": partial("test/raise_indentation"),
  "test/render-file-from-template": (view) =>
    assigns(view, { path: "test/hello-world" }, () =>
      view.render({ template: "test/render-file-from-template" }),
    ),
  "test/render_file_with_locals_and_default": template("test/render_file_with_locals_and_default", {
    locals: { secret: "two" },
  }),
  "test/render-implicit-html-template-from-xhr-request.da": template(
    "test/render-implicit-html-template-from-xhr-request",
    { locale: [":da"] },
  ),
  "test/render-implicit-html-template-from-xhr-request": template(
    "test/render-implicit-html-template-from-xhr-request",
  ),
  "test/render-implicit-js-template-without-layout.js": template(
    "test/render-implicit-js-template-without-layout",
    { formats: ":js" },
  ),
  "test/render_partial_inside_directory": template("test/render_partial_inside_directory"),
  "test/render_template_with_ivar": (view) =>
    assigns(view, { secret: "in the sauce" }, () =>
      view.render({ template: "test/render_template_with_ivar" }),
    ),
  "test/render-template-with-locals": template("test/render-template-with-locals", {
    locals: { secret: "area51" },
  }),
  "test/render-to-string-test": (view) =>
    assigns(view, { foo: "bar" }, () => view.render({ template: "test/render-to-string-test" })),
  "test/render_two_partials": template("test/render_two_partials"),
  "test/_second_json_partial.json": partial("test/second_json_partial", { formats: ":json" }),
  "test/using-layout-around-block": template("test/using-layout-around-block"),
  "test/with_html_partial": template("test/with_html_partial"),
  "test/with_partial": template("test/with_partial"),
  "test/with_partial.text": template("test/with_partial", { formats: ":text" }),
  "test/with_xml_template": template("test/with_xml_template"),
};

async function attempt(scenario: () => unknown): Promise<string> {
  try {
    return String(await scenario());
  } catch (error) {
    return `raised ${(error as Error).name}: ${(error as Error).message}`;
  }
}

let group = "";

function viewFor(files: [string, string][]): Base {
  const lookupContext = new LookupContext(null, {}, ["test"]);
  const formatted = files.map(([file, src]) => [
    file.replace(/(?<!\.(?:html|json|xml|text|js))\.tse$/, ".html.tse"),
    src,
  ]);
  lookupContext.appendViewPaths([new FixtureResolver(Object.fromEntries(formatted))]);
  return new (Base.withEmptyTemplateCache())(lookupContext, {}, { performCaching: false });
}

async function renderAll(): Promise<Record<string, string>> {
  const files = Object.entries(fixtures);
  const out: Record<string, string> = {};
  group = "actionview";
  let view = viewFor(files.filter(([file]) => !file.startsWith(ACTIONPACK)));
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    out[name] = String(await scenario(view));
  }
  group = "actionpack";
  const actionpack = files.filter(([file]) => file.startsWith(ACTIONPACK));
  for (const [name, scenario] of Object.entries(ACTIONPACK_SCENARIOS)) {
    view = viewFor(actionpack.map(([file, src]) => [file.slice(ACTIONPACK.length), src]));
    out[ACTIONPACK + name] = await attempt(() => scenario(view));
  }
  return out;
}

describe("TSE stand-in scope", () => {
  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("tse", new TseHandler());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TemplateHandlers.clear();
  });

  it("covers a scenario for every fixture", () => {
    const covered = [
      ...Object.keys(SCENARIOS),
      ...Object.keys(ACTIONPACK_SCENARIOS).map((name) => ACTIONPACK + name),
    ];
    for (const file of Object.keys(fixtures)) {
      const name = file.replace(/(\.html)?\.tse$/, "");
      expect(covered, file).toContain(name);
    }
  });

  it("renders every fixture through the emitted stand-in as the with chain does", async () => {
    const evaluated = await renderAll();
    const prototype = Template.prototype as unknown as { compile(...args: unknown[]): void };
    const compile = vi.spyOn(prototype, "compile").mockImplementation(function (
      this: unknown,
      mod: unknown,
    ) {
      const template = this as Template;
      Object.assign(template, { group });
      const render = standIn(template.source);
      const { virtualPath } = template;
      (mod as { _compiledMethods: Map<string, unknown> })._compiledMethods.set(
        template.methodName(),
        function (
          this: Base & { virtualPath: unknown },
          localAssigns: object,
          _o: unknown,
          kwargs: object | undefined,
          _: unknown,
        ) {
          this.virtualPath = virtualPath;
          return render.call(this, this, kwargs ?? localAssigns, _);
        },
      );
    });
    expect(await renderAll()).toEqual(evaluated);
    const compiled = new Set(
      compile.mock.contexts.map(
        (t) => `${(t as Template & { group: string }).group}:${(t as Template).identifier}`,
      ),
    );
    expect(compiled.size).toBe(Object.keys(fixtures).length);
    const methods = new Set(compile.mock.contexts.map((t) => (t as Template).methodName()));
    expect(methods.size).toBe(compile.mock.calls.length);
  });

  const view = (): Base => {
    const v = new (Base.withEmptyTemplateCache())(null, {}, null);
    v.outputBuffer = new OutputBuffer();
    return v;
  };

  it("writes an assigned view property to the view", async () => {
    const v = view();
    await standIn('<% virtualPath = "written" %>').call(v, v, {});
    expect(v.virtualPath).toBe("written");
  });

  it("reads a view property changed during the render live", async () => {
    const v = view();
    v.virtualPath = "before";
    const out = await standIn('<% this.virtualPath = "after" %><%= virtualPath %>').call(v, v, {});
    expect(String((out as OutputBuffer).toString())).toBe("after");
  });

  it("raises ReferenceError for an undefined name at its point of use", async () => {
    const v = view();
    await expect(standIn("<%= notDefinedAnywhere %>").call(v, v, {})).rejects.toThrow(
      ReferenceError,
    );
  });

  const render = async (source: string): Promise<string> => {
    const v = view();
    return String(((await standIn(source).call(v, v, {})) as OutputBuffer).toString());
  };

  it("binds a for-of target that names nothing per render", async () => {
    expect(await render("<% for (item of [1, 2]) { %><%= item %><% } %>")).toBe("12");
  });

  it("binds destructuring targets that name nothing per render", async () => {
    expect(await render("<% [a, { b, c = 3 }] = [1, { b: 2 }] %><%= a + b + c %>")).toBe("6");
  });

  it("binds an assignment made inside a nested function", async () => {
    expect(await render("<% (() => { count = 5; })() %><%= count %>")).toBe("5");
  });

  it("does not overwrite a global the template assigns", async () => {
    const fetch = globalThis.fetch;
    expect(await render("<% fetch = 1 %><%= fetch %>")).toBe("1");
    expect(globalThis.fetch).toBe(fetch);
  });
});
