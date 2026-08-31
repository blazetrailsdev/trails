import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { MissingTemplate, LookupContext } from "./lookup-context.js";
import type { TemplateResolver } from "./resolver/resolver.js";
import { Template } from "./template.js";
import { TemplateHandlers } from "./template/handlers.js";
import { Tse } from "./template/handlers/tse.js";

describe("MissingTemplate#corrections", () => {
  it("returns close template path matches ranked by Jaro distance", () => {
    const err = new MissingTemplate(
      "posts",
      "indx",
      "html",
      [],
      ["posts/index", "posts/show", "posts/new", "comments/index"],
    );
    expect(err.corrections[0]).toBe("posts/index");
  });

  it("returns [] when no candidate paths are provided", () => {
    const err = new MissingTemplate("posts", "index", "html", []);
    expect(err.corrections).toEqual([]);
  });

  it("filters partials when the missing path is a partial", () => {
    const err = new MissingTemplate(
      "posts",
      "_form",
      "html",
      [],
      ["posts/_form", "posts/_header", "posts/index"],
    );
    const corrections = err.corrections;
    expect(corrections).not.toContain("posts/index");
    expect(corrections[0]).toBe("posts/form");
  });

  it("filters non-partials when the missing path is not a partial", () => {
    const err = new MissingTemplate(
      "posts",
      "index",
      "html",
      [],
      ["posts/_form", "posts/index", "posts/show"],
    );
    const corrections = err.corrections;
    expect(corrections).not.toContain("posts/form");
    expect(corrections).not.toContain("posts/_form");
  });

  it("returns at most 6 suggestions", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => `posts/action${i}`);
    const err = new MissingTemplate("posts", "actio0", "html", [], candidates);
    expect(err.corrections.length).toBeLessThanOrEqual(6);
  });

  it("memoises the result", () => {
    const err = new MissingTemplate("posts", "indx", "html", [], ["posts/index"]);
    expect(err.corrections).toBe(err.corrections);
  });

  it("strips leading underscore from root-level partial suggestions", () => {
    const err = new MissingTemplate("", "_frm", "html", [], ["_form", "_header"]);
    expect(err.corrections[0]).toBe("form");
  });
});

describe("LookupContext allCandidatePaths wiring", () => {
  it("passes resolver allTemplatePaths into MissingTemplate when render throws", async () => {
    const resolver: TemplateResolver = {
      find: () => null,
      allTemplatePaths: () => ["posts/index", "posts/show", "posts/indx"],
    };
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(resolver);

    let caught: MissingTemplate | undefined;
    try {
      await ctx.render("posts", "indx", "html");
    } catch (e) {
      if (e instanceof MissingTemplate) caught = e;
    }

    expect(caught).toBeInstanceOf(MissingTemplate);
    expect(caught!.candidatePaths).toContain("posts/index");
    expect(caught!.corrections[0]).toBe("posts/indx");
  });

  it("passes resolver allTemplatePaths into MissingTemplate when renderPartial throws", async () => {
    const resolver: TemplateResolver = {
      find: () => null,
      allTemplatePaths: () => ["posts/_form", "posts/_header"],
    };
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(resolver);

    let caught: MissingTemplate | undefined;
    try {
      await ctx.renderPartial("frm", "posts", "html");
    } catch (e) {
      if (e instanceof MissingTemplate) caught = e;
    }

    expect(caught).toBeInstanceOf(MissingTemplate);
    expect(caught!.candidatePaths).toContain("posts/_form");
    expect(caught!.corrections).toContain("posts/form");
  });
});

describe("LookupContext#renderPartialSync", () => {
  const template = (identifier: string, source: string): Template =>
    new Template({ source, identifier, extension: "tse", format: "html" });

  function contextWith(templates: Record<string, string>): LookupContext {
    const resolver: TemplateResolver = {
      find: (name, prefix) => {
        const key = prefix ? `${prefix}/${name}` : name;
        const source = templates[key];
        return source === undefined ? null : template(key, source);
      },
      allTemplatePaths: () => Object.keys(templates),
    };
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(resolver);
    return ctx;
  }

  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
  });

  afterEach(() => {
    TemplateHandlers.clear();
  });

  it("restores the parent's virtual path after a nested partial returns", () => {
    const ctx = contextWith({
      "posts/_post":
        '<%= render({ partial: "shared/spacer" }) %>|<%= render({ partial: "byline" }) %>',
      "shared/_spacer": "spacer",
      "posts/_byline": "byline",
    });
    expect(ctx.renderPartialSync("post", "posts", "html")).toBe("spacer|byline");
  });

  it("renders a partial by bare name against the given prefix", () => {
    const ctx = contextWith({ "posts/_form": "<%= title %>" });
    expect(ctx.renderPartialSync("form", "posts", "html", { title: "New" })).toBe("New");
  });

  it("takes the prefix from a qualified name", () => {
    const ctx = contextWith({ "users/_user": "<li><%= user %></li>" });
    expect(ctx.renderPartialSync("users/user", "posts", "html", { user: "Ada" })).toBe(
      "<li>Ada</li>",
    );
  });

  it("resolves a partial nested inside a partial", () => {
    const ctx = contextWith({
      "posts/_post": '<%= render({ partial: "posts/byline", locals: { name: name } }) %>',
      "posts/_byline": "by <%= name %>",
    });
    expect(ctx.renderPartialSync("post", "posts", "html", { name: "Ada" })).toBe("by Ada");
  });

  it("raises MissingTemplate when the partial does not resolve", () => {
    const ctx = contextWith({ "posts/_form": "" });
    expect(() => ctx.renderPartialSync("frm", "posts", "html")).toThrow(MissingTemplate);
  });

  it("raises rather than emitting [object Promise] for an async handler", () => {
    TemplateHandlers.registerTemplateHandler("tse", {
      extensions: ["tse"],
      render: async () => "later",
    });
    const ctx = contextWith({ "posts/_form": "hi" });
    expect(() => ctx.renderPartialSync("form", "posts", "html")).toThrow(/renders asynchronously/);
  });

  it("is reachable from a template rendered through renderTemplate", async () => {
    const ctx = contextWith({ "posts/_form": "form!" });
    const out = await ctx.renderTemplate(
      template("posts/index", '<%= render({ partial: "form" }) %>'),
      {},
      { controller: "posts", action: "index", format: "html" },
    );
    expect(out).toBe("form!");
  });
});

describe("LookupContext#render with a layout", () => {
  const template = (identifier: string, source: string): Template =>
    new Template({ source, identifier, extension: "tse", format: "html" });

  function contextWith(templates: Record<string, string>): LookupContext {
    const resolver: TemplateResolver = {
      find: (name, prefix) => {
        const key = prefix ? `${prefix}/${name}` : name;
        const source = templates[key];
        return source === undefined ? null : template(key, source);
      },
      findLayout: (name, _format, _extensions) => {
        const source = templates[`layouts/${name}`];
        return source === undefined ? null : template(`layouts/${name}`, source).asLayout();
      },
      allTemplatePaths: () => Object.keys(templates),
    };
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(resolver);
    return ctx;
  }

  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
  });

  afterEach(() => {
    TemplateHandlers.clear();
  });

  it("renders the content template inside the layout", async () => {
    const ctx = contextWith({
      "posts/index": "<p>body</p>",
      "layouts/application": "<main><%= yield %></main>",
    });
    expect(await ctx.render("posts", "index", "html", {}, { layout: "application" })).toBe(
      "<main><p>body</p></main>",
    );
  });

  it("carries a named contentFor section from the content template to the layout", async () => {
    const ctx = contextWith({
      "posts/index": '<% contentFor("title", () => { %>Home<% }) %><p>body</p>',
      "layouts/application": '<title><%= _layoutFor("title") %></title><%= yield %>',
    });
    expect(await ctx.render("posts", "index", "html", {}, { layout: "application" })).toBe(
      "<title>Home</title><p>body</p>",
    );
  });
});
