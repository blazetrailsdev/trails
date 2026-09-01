import { htmlSafe } from "@blazetrails/activesupport";
import { afterEach, describe, expect, it } from "vitest";
import { Base } from "./base.js";
import { StrictLocalsMismatch } from "./strict-locals.js";
import { Template } from "./template.js";
import { SyntaxErrorInTemplate, TemplateError } from "./template/error.js";
import { TemplateHandlers, type TemplateHandler } from "./template/handlers.js";
import { Tse } from "./template/handlers/tse.js";

const echo: TemplateHandler = {
  extensions: ["txt"],
  call: (_template, source) => JSON.stringify(`${source}::`) + " + JSON.stringify(localAssigns)",
};

const view = (): Base => new (Base.withEmptyTemplateCache())(null, {}, null);

describe("ActionView::Template (smoke)", () => {
  afterEach(() => TemplateHandlers.clear());

  it("stores Rails-named attrs and derives variable from virtualPath", () => {
    const t = new Template({
      source: "hi",
      identifier: "posts/_form",
      virtualPath: "posts/_form.html.tse",
      format: "html",
      variant: "phone",
      extension: "tse",
      locals: ["a"],
    });
    expect(t.identifier).toBe("posts/_form");
    expect(t.format).toBe("html");
    expect(t.variant).toBe("phone");
    expect(t.variable).toBe("form");
    expect(t.isPartial).toBe(true);
    expect(t.locals).toEqual(["a"]);
  });

  it("strict_locals! strips the magic comment and memoizes the signature", () => {
    const t = new Template({
      source: "<%# locals: (headline:, alerts: []) %>\nbody",
      identifier: "x",
    });
    expect(t.strictLocalsBang()).toBe("headline:, alerts: []");
    expect(t.source).not.toMatch(/locals:/);
    expect(t.strictLocalsQ()).toBe(true);
    expect(t.locals).toBeNull();

    const afterFirst = t.source;
    expect(t.strictLocalsBang()).toBe("headline:, alerts: []");
    expect(t.source).toBe(afterFirst);
  });

  it("render delegates to the handler and wraps non-TemplateError failures", () => {
    TemplateHandlers.registerTemplateHandler("txt", echo);
    const t = new Template({ source: "hi", identifier: "x", extension: "txt" });
    expect(t.render(view(), { name: "ada" })).toBe(`hi::${JSON.stringify({ name: "ada" })}`);

    const boom = new Template({
      source: "hi",
      identifier: "y",
      extension: "txt",
      handler: {
        extensions: ["txt"],
        call: () => {
          throw new Error("boom");
        },
      },
    });
    expect(() => boom.render(view())).toThrow(TemplateError);
  });

  it("render throws a helpful error when no handler is registered", () => {
    const t = new Template({ source: "x", identifier: "x", extension: "nope" });
    let raised: unknown;
    try {
      t.render(view());
    } catch (e) {
      raised = e;
    }
    expect(raised).toBeInstanceOf(TemplateError);
    expect(raised).not.toBeInstanceOf(SyntaxErrorInTemplate);
    expect((raised as TemplateError).message).toMatch(/No template handler registered for ".nope"/);
  });

  it("compile raises SyntaxErrorInTemplate when the compiled source will not parse", () => {
    const t = new Template({
      source: "x",
      identifier: "posts/show",
      extension: "txt",
      handler: { extensions: ["txt"], call: () => "((((" },
    });
    let raised: unknown;
    try {
      t.render(view());
    } catch (e) {
      raised = e;
    }
    expect(raised).toBeInstanceOf(SyntaxErrorInTemplate);
    expect((raised as Error).message).toBe(
      "Encountered a syntax error while rendering template: check x\n",
    );
  });

  it("asLayout returns a copy with isLayout flipped on", () => {
    const t = new Template({ source: "<html/>", identifier: "layouts/app", extension: "tse" });
    const wrapped = t.asLayout();
    expect(wrapped.isLayout).toBe(true);
    expect(t.isLayout).toBe(false);
    expect(wrapped).not.toBe(t);
  });

  it("exposes Template.Error for the Rails-spelled nesting", () => {
    expect(Template.Error).toBe(TemplateError);
  });

  describe("#translate_location", () => {
    const spot = () => ({
      snippet: "",
      firstLineno: 1,
      lastLineno: 1,
      firstColumn: 0,
      lastColumn: 0,
    });

    it("returns the spot unchanged when the handler has no translate_location", () => {
      const t = new Template({ source: "hi", identifier: "x", extension: "txt", handler: echo });
      const s = spot();
      expect(t.translateLocation({ lineno: 1 }, s)).toBe(s);
    });

    it("falls back to the spot when the handler returns nil", () => {
      const handler: TemplateHandler = {
        ...echo,
        translateLocation: () => null,
      } as TemplateHandler;
      const t = new Template({ source: "hi", identifier: "x", extension: "txt", handler });
      const s = spot();
      expect(t.translateLocation({ lineno: 1 }, s)).toBe(s);
    });

    it("reaches the handler's translate_location", () => {
      const translated = spot();
      const handler: TemplateHandler = {
        ...echo,
        translateLocation: () => translated,
      } as TemplateHandler;
      const t = new Template({ source: "hi", identifier: "x", extension: "txt", handler });
      expect(t.translateLocation({ lineno: 1 }, spot())).toBe(translated);
    });

    it("reaches the Tse handler's translate_location", () => {
      const source = "<%= 1 %>\n<%= boom %>\n";
      const t = new Template({ source, identifier: "t", extension: "tse", handler: new Tse() });
      const s = spot();
      expect(t.translateLocation({ lineno: 2 }, s)).toBeDefined();
    });
  });

  describe("#render", () => {
    const ctx = (extra: { view?: Base; yield?: string } = {}): { view?: Base; yield?: string } =>
      extra;

    const template = (source: string): Template =>
      new Template({ source, identifier: "t", extension: "tse", handler: new Tse() });

    const render = (
      source: string,
      locals: Record<string, unknown> = {},
      extra: { view?: Base; yield?: string } = {},
    ): string => {
      const view = extra.view ?? new (Base.withEmptyTemplateCache())(null, {}, null);
      if (extra.yield !== undefined) view.viewFlow.set("layout", extra.yield);
      return template(source).render(view, locals);
    };

    it("executes the compiled template and returns its output", () => {
      expect(render("<h1>hi</h1>", {}, ctx())).toBe("<h1>hi</h1>");
    });

    it("resolves a local as a bare identifier", () => {
      expect(render("<%= name %>", { name: "Ada" }, ctx())).toBe("Ada");
    });

    it("escapes an unsafe local", () => {
      expect(render("<%= name %>", { name: "<b>" }, ctx())).toBe("&lt;b&gt;");
    });

    it("does not escape a raw() local", () => {
      expect(render("<%= raw(name) %>", { name: "<b>" }, ctx())).toBe("<b>");
    });

    it("runs code tags", () => {
      const out = render(
        "<% for (const n of names) { %><%= n %>,<% } %>",
        { names: ["a", "b"] },
        ctx(),
      );
      expect(out).toBe("a,b,");
    });

    it("lets a local shadow a same-named view helper", () => {
      expect(render("<%= raw %>", { raw: "local wins" }, ctx())).toBe("local wins");
    });

    it("emits the inner template's output for a bare yield in a layout", () => {
      const out = render("<main><%= yield %></main>", {}, ctx({ yield: "<p>body</p>" }));
      expect(out).toBe("<main><p>body</p></main>");
    });

    it("round-trips a named contentFor section", () => {
      const out = render(
        '<% contentFor("side", () => { %>aside<% }) %><%= _layoutFor("side") %>',
        {},
        ctx(),
      );
      expect(out).toBe("aside");
    });

    it("renders a nested partial through the view's render helper", () => {
      const seen: Array<[string, Record<string, unknown>]> = [];
      const view = new (Base.withEmptyTemplateCache())(null, {}, null);
      view.render = (options) => {
        seen.push([options.partial, options.locals ?? {}]);
        return htmlSafe("<li>Ada</li>");
      };
      const out = render(
        '<%= render({ partial: "users/user", locals: { user: user } }) %>',
        { user: "Ada" },
        ctx({ view }),
      );
      expect(out).toBe("<li>Ada</li>");
      expect(seen).toEqual([["users/user", { user: "Ada" }]]);
    });

    it("resolves an ActionView helper mixed onto the view as a bare identifier", () => {
      expect(render("<%= raw(value) %>", { value: "<b>" }, ctx())).toBe("<b>");
    });

    it("runs the compiled method with the view as `this`", () => {
      const view = new (Base.withEmptyTemplateCache())(null, {}, null);
      let seen: unknown;
      (view as unknown as Record<string, unknown>).whoAmI = function (this: Base) {
        seen = this as unknown;
        return "ok";
      };
      expect(render("<%= whoAmI() %>", {}, ctx({ view }))).toBe("ok");
      expect(seen).toBe(view);
    });

    it("memoizes the compiled method on the view's compiledMethodContainer", () => {
      const view = new (Base.withEmptyTemplateCache())(null, {}, null);
      const container = view.compiledMethodContainer();
      const before = container._compiledMethods.size;
      const t = template("<%= n %>");
      t.render(view, { n: 1 });
      const after = container._compiledMethods.size;
      t.render(view, { n: 2 });
      expect(after).toBe(before + 1);
      expect(container._compiledMethods.size).toBe(after);
    });

    it("gives two withEmptyTemplateCache containers separate compiled methods", () => {
      const a = new (Base.withEmptyTemplateCache())(null, {}, null);
      const b = new (Base.withEmptyTemplateCache())(null, {}, null);
      template("<%= n %>").render(a, { n: 1 });
      expect(a.compiledMethodContainer()._compiledMethods.size).toBe(1);
      expect(b.compiledMethodContainer()._compiledMethods.size).toBe(0);
    });

    it("does not let the compiled function's own name shadow the render helper", () => {
      expect(() => render('<%= render({ partial: "p" }) %>', {}, ctx())).toThrow(
        /has no lookup context/,
      );
    });

    it("enforces a strict-locals signature against the passed locals, not the helper scope", () => {
      const source = "<%# locals: (name:) %>\n<%= name %>";
      expect(render(source, { name: "Ada" }, ctx())).toContain("Ada");
      let raised: unknown;
      try {
        render(source, { name: "Ada", extra: 1 }, ctx());
      } catch (e) {
        raised = e;
      }
      expect((raised as TemplateError).original).toBeInstanceOf(StrictLocalsMismatch);
    });

    it("memoizes the compile, so a second render of the same source reuses it", () => {
      const view = new (Base.withEmptyTemplateCache())(null, {}, null);
      const t = template("<%= n %>");
      expect(t.render(view, { n: 1 })).toBe("1");
      expect(t.render(view, { n: 2 })).toBe("2");
      expect(view.compiledMethodContainer()._compiledMethods.size).toBe(1);
    });
  });
});
