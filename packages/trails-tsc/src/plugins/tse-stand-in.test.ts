import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript-5";
import {
  Base,
  FixtureResolver,
  LookupContext,
  Template,
  TemplateHandlers,
  TopLevel,
  TseHandler,
} from "@blazetrails/actionview";
import { virtualizeTse } from "./tse.js";

// @ts-expect-error -- Property 'glob' does not exist on type 'ImportMeta'
const globbed: Record<string, string> = import.meta.glob(
  "../../../actionview/src/test-helpers/fixtures/**/*.tse",
  { query: "?raw", import: "default", eager: true },
);
const fixtures = Object.fromEntries(
  Object.entries(globbed).map(([file, src]) => [file.split("/fixtures/")[1], src]),
);

type StandIn = (this: object, context: object, locals: object, _?: unknown) => Promise<unknown>;

function standIn(source: string): StandIn {
  const js = ts.transpileModule(virtualizeTse(source, { view: "any" }), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const body = js
    .replace('import { TopLevel } from "@blazetrails/actionview";', "")
    .replace("export default async function render(", "return async function render(");
  return new Function("TopLevel", body)(TopLevel) as StandIn;
}

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
        customer("david", "good_customers/good_customer"),
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
};

async function renderAll(): Promise<Record<string, string>> {
  const lookupContext = new LookupContext(null, {}, ["test"]);
  const formatted = Object.entries(fixtures).map(([file, src]) => [
    file.replace(/(?<!\.html)\.tse$/, ".html.tse"),
    src,
  ]);
  lookupContext.appendViewPaths([new FixtureResolver(Object.fromEntries(formatted))]);
  const view = new (Base.withEmptyTemplateCache())(lookupContext, {}, { performCaching: false });
  const out: Record<string, string> = {};
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    out[name] = String(await scenario(view));
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
    const covered = Object.keys(SCENARIOS);
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
    expect(compile).toHaveBeenCalledTimes(Object.keys(fixtures).length);
  });
});
