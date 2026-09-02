import { describe, it, expect } from "vitest";
import { DelegationError, InheritableOptions } from "@blazetrails/activesupport";
import { Base } from "./base.js";
import { LookupContext } from "./lookup-context.js";
import { OutputBuffer } from "./buffers.js";
import { TemplateHandlers } from "./template/handlers.js";
import { Tse } from "./template/handlers/tse.js";
import { Template } from "./template.js";

/** Compile and run a `.tse` source through `Template#render`, as Rails does. */
const renderTse = (source: string, locals: Record<string, unknown>, view: Base): string =>
  new Template({ source, identifier: "t", extension: "tse", handler: new Tse() }).render(
    view,
    locals,
  );

describe("ActionView::Base", () => {
  it("prepares the context with an output buffer, a view flow and no virtual path", () => {
    const view = new (Base.withEmptyTemplateCache())(null, {}, null);
    expect(view.outputBuffer).toBeInstanceOf(OutputBuffer);
    expect(view.viewFlow).toBeDefined();
    expect(view.virtualPath).toBeNull();
  });

  it("assigns each key as an instance variable", () => {
    const view = new Base(null, { title: "Home" }, null);
    expect((view as unknown as Record<string, unknown>).title).toBe("Home");
    expect(view._assigns).toEqual({ title: "Home" });
  });

  it("_layout_for returns the default layout section", () => {
    const view = new (Base.withEmptyTemplateCache())(null, {}, null);
    view.viewFlow.set("layout", "<p>body</p>");
    expect(view._layoutFor().toString()).toBe("<p>body</p>");
  });

  it("_layout_for returns an empty buffer for an unwritten section", () => {
    expect(new (Base.withEmptyTemplateCache())(null, {}, null)._layoutFor("nope").toString()).toBe(
      "",
    );
  });

  it("_run swaps the output buffer and restores it afterwards", () => {
    const view = new (Base.withEmptyTemplateCache())(null, {}, null);
    const original = view.outputBuffer;
    const buffer = new OutputBuffer();
    view.compiledMethodContainer()._compiledMethods.set("_m", function (this: Base) {
      expect(this.outputBuffer).toBe(buffer);
      return null;
    });
    view._run("_m", null, {}, buffer);
    expect(view.outputBuffer).toBe(original);
  });

  it("_run restores the buffer even when the method throws", () => {
    const view = new (Base.withEmptyTemplateCache())(null, {}, null);
    const original = view.outputBuffer;
    view.compiledMethodContainer()._compiledMethods.set("_m", () => {
      throw new Error("boom");
    });
    expect(() => view._run("_m", null, {}, new OutputBuffer())).toThrow("boom");
    expect(view.outputBuffer).toBe(original);
  });

  it("compiledMethodContainer raises on a plain Base, as Rails' does", () => {
    expect(() => new Base(null, {}, null).compiledMethodContainer()).toThrow(
      /must implement `compiledMethodContainer`/,
    );
    expect(() => Base.compiledMethodContainer()).toThrow(/must implement/);
  });

  it("changed? compares the two classes' compiled method containers", () => {
    const a = Base.withEmptyTemplateCache();
    const b = Base.withEmptyTemplateCache();
    expect(a.changedQ(b)).toBe(true);
    expect(a.changedQ(a)).toBe(false);
  });

  it("withViewPaths builds a LookupContext for the view", () => {
    const view = Base.withEmptyTemplateCache().withViewPaths([]);
    expect(view.lookupContext).toBeInstanceOf(LookupContext);
  });

  it("withEmptyTemplateCache gives each subclass its own compiled methods", () => {
    const a = Base.withEmptyTemplateCache();
    const b = Base.withEmptyTemplateCache();
    expect(a._compiledMethods).not.toBe(b._compiledMethods);
    expect(new a(null, {}, null).compiledMethodContainer()).toBe(a);
  });

  it("carries the ActionView helpers as instance methods", () => {
    const view = new (Base.withEmptyTemplateCache())(null, {}, null);
    expect(typeof view.raw).toBe("function");
    expect(typeof view.capture).toBe("function");
    expect(typeof view.contentFor).toBe("function");
  });

  it("lets a local shadow a helper of the same name, as locals_code does", () => {
    const view = new (Base.withEmptyTemplateCache())(null, {}, null);
    expect(renderTse("<%= raw %>", { raw: "local wins" }, view)).toBe("local wins");
  });
});

describe("ActionView::Base include Helpers", () => {
  const view = () => new (Base.withEmptyTemplateCache())(null, {}, null);

  it("carries TagHelper, NumberHelper, TextHelper and SanitizeHelper as instance methods", () => {
    const v = view() as unknown as Record<string, unknown>;
    for (const name of [
      "tag",
      "contentTag",
      "numberToCurrency",
      "truncate",
      "stripTags",
      "debug",
    ]) {
      expect(typeof v[name]).toBe("function");
    }
  });

  it("leaves a helper module's constants off the method table, as include does", () => {
    const v = view() as unknown as Record<string, unknown>;
    expect(v.FormBuilder).toBeUndefined();
    expect(v.TagBuilder).toBeUndefined();
  });

  it("resolves a helper as a bare identifier in a template", () => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    try {
      const out = renderTse('<%= contentTag("p", name) %>', { name: "Ada" }, view());
      expect(out).toBe("<p>Ada</p>");
    } finally {
      TemplateHandlers.clear();
    }
  });

  it("resolves a number helper as a bare identifier in a template", () => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    try {
      const out = renderTse("<%= numberToCurrency(amount) %>", { amount: 12.5 }, view());
      expect(out).toContain("12.50");
    } finally {
      TemplateHandlers.clear();
    }
  });
});

describe("ActionView::Base include ControllerHelper", () => {
  const controller = {
    params: { id: "1" },
    session: { user: "ada" },
    flash: { notice: "saved" },
    cookies: { c: "1" },
    response: { status: 200 },
    headers: { h: "1" },
    actionName: "index",
    controllerName: "posts",
    controllerPath: "admin/posts",
    requestForgeryProtectionToken: "tok",
    request: { host: "example.com" },
    logger: { info: () => undefined },
  };

  it("raises DelegationError for a delegate read on a nil-controller view", () => {
    // `delegate(*CONTROLLER_DELEGATES, to: :controller)` (controller_helper.rb:19)
    // passes no allow_nil, so delegation.rb:129-143 raises rather than answering nil.
    const view = new (Base.withEmptyTemplateCache())(null, {}, null) as unknown as {
      params: unknown;
    };
    expect(() => view.params).toThrow(DelegationError);
    expect(() => view.params).toThrow(/params delegated to controller, but controller is nil/);
  });

  it("delegates CONTROLLER_DELEGATES to the controller", () => {
    const view = new (Base.withEmptyTemplateCache())(null, {}, controller) as unknown as Record<
      string,
      unknown
    >;
    expect(view.params).toEqual({ id: "1" });
    expect(view.session).toEqual({ user: "ada" });
    expect(view.flash).toEqual({ notice: "saved" });
    expect(view.actionName).toBe("index");
    expect(view.controllerPath).toBe("admin/posts");
    expect(view.requestForgeryProtectionToken).toBe("tok");
  });

  it("assign_controller captures the controller's request", () => {
    const view = new (Base.withEmptyTemplateCache())(null, {}, controller);
    expect(view._request).toEqual({ host: "example.com" });
  });

  it("assign_controller leaves the internals nil for a nil controller", () => {
    const view = new (Base.withEmptyTemplateCache())(null, {}, null);
    expect(view._controller).toBeNull();
    expect(view._request).toBeNull();
  });

  it("initialize sets _config to an InheritableOptions before assign_controller runs", () => {
    // base.rb:245 assigns it unconditionally; controller_helper.rb:27's
    // `@_config ||= nil` is then a no-op against the truthy value.
    expect(new (Base.withEmptyTemplateCache())(null, {}, null)._config).toBeInstanceOf(
      InheritableOptions,
    );
  });

  it("logger reads through to the controller's", () => {
    const view = new (Base.withEmptyTemplateCache())(null, {}, controller);
    expect((view as unknown as { logger(): unknown }).logger()).toBe(controller.logger);
  });

  it("makes params reachable as a bare identifier in a template", () => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    try {
      const view = new (Base.withEmptyTemplateCache())(null, {}, controller);
      const out = renderTse("<%= params.id %>", {}, view);
      expect(out).toBe("1");
    } finally {
      TemplateHandlers.clear();
    }
  });
});

describe("ActionView::Base include TSE::Util", () => {
  it("resolves h() as a bare identifier in a template", () => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    try {
      const out = renderTse(
        "<%= h(name) %>",
        { name: "<b>" },
        new (Base.withEmptyTemplateCache())(null, {}, null),
      );
      expect(out).toBe("&lt;b&gt;");
    } finally {
      TemplateHandlers.clear();
    }
  });

  it("carries htmlEscapeOnce, jsonEscape and xmlNameEscape onto the view", () => {
    const view = new (Base.withEmptyTemplateCache())(null, {}, null);
    expect(typeof view.htmlEscapeOnce).toBe("function");
    expect(typeof view.jsonEscape).toBe("function");
    expect(typeof view.xmlNameEscape).toBe("function");
  });
});

describe("ActionView::Base lookup_context delegation", () => {
  it("delegates formats= and locale= writes to the lookup context", () => {
    const lookupContext = new LookupContext(null, {}, []);
    const view = new (Base.withEmptyTemplateCache())(lookupContext, {}, null);

    view.formats = ["json"];
    expect(lookupContext.formats).toEqual(["json"]);
    expect(view.formats).toEqual(["json"]);

    view.locale = "fr";
    expect(lookupContext.locale).toBe("fr");
    expect(view.locale).toBe("fr");
  });

  it("reads view_paths through, and refuses a write as Rails' missing writer does", () => {
    const lookupContext = new LookupContext(null, {}, []);
    const view = new (Base.withEmptyTemplateCache())(lookupContext, {}, null);
    expect(view.viewPaths).toBe(lookupContext.viewPaths);
    // lookup_context.rb:126 is attr_reader; view_paths= lives on the
    // controller-side ViewPaths (view_paths.rb:68), so Rails raises here too.
    expect(() => {
      (view as unknown as { viewPaths: unknown }).viewPaths = [];
    }).toThrow(TypeError);
  });
});

describe("ActionView::Helpers::ControllerHelper#assign_controller", () => {
  it("copies the controller's config with inheritable_copy", () => {
    const copy = { copied: true };
    const controller = { config: { inheritableCopy: () => copy } };
    expect(new (Base.withEmptyTemplateCache())(null, {}, controller)._config).toBe(copy);
  });

  it("raises when a controller carries a config that cannot be copied", () => {
    // controller_helper.rb:24 guards on respond_to?(:config), then calls
    // inheritable_copy unconditionally — a config without it is a NoMethodError.
    expect(() => new (Base.withEmptyTemplateCache())(null, {}, { config: {} } as never)).toThrow(
      TypeError,
    );
  });
});

describe("ActionView::Base attr_internal readers", () => {
  const controller = { request: { host: "example.com" } };

  it("exposes controller, request, config and assigns as accessors over the ivars", () => {
    const view = new (Base.withEmptyTemplateCache())(null, { title: "Home" }, controller);
    expect(view.controller).toBe(controller);
    expect(view.request).toEqual({ host: "example.com" });
    expect(view.config).toBeInstanceOf(InheritableOptions);
    expect(view.assigns).toEqual({ title: "Home" });
  });

  it("attr_internal is an accessor pair, so the writers reach the ivar", () => {
    const view = new (Base.withEmptyTemplateCache())(null, {}, null);
    view.request = { host: "other.test" };
    expect(view._request).toEqual({ host: "other.test" });
    view.assigns = { a: 1 };
    expect(view._assigns).toEqual({ a: 1 });
  });

  it("resolves request as a bare identifier in a template", () => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    try {
      const out = renderTse(
        "<%= request.host %>",
        {},
        new (Base.withEmptyTemplateCache())(null, {}, controller),
      );
      expect(out).toBe("example.com");
    } finally {
      TemplateHandlers.clear();
    }
  });
});
