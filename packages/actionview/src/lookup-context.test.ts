import { afterEach, describe, it, expect } from "vitest";
import { MissingTemplate, LookupContext } from "./lookup-context.js";
import { TemplateHandlers } from "./template/handlers.js";
import { Tse } from "./template/handlers/tse.js";
import type { TemplateResolver } from "./resolver/resolver.js";

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

describe("LookupContext variant propagation", () => {
  const tse = new Tse();
  TemplateHandlers.registerTemplateHandler(...tse.extensions, tse);
  afterEach(() => {
    TemplateHandlers.clear();
    TemplateHandlers.registerTemplateHandler(...tse.extensions, tse);
  });

  /**
   * Resolver whose templates are keyed `prefix/name` with an optional
   * `+variant` suffix, mirroring `FileSystemResolver`'s precedence.
   */
  function variantResolver(templates: Record<string, string>): TemplateResolver {
    return {
      find: (name, prefix, _format, _extensions, variants = []) => {
        for (const variant of variants) {
          const hit = templates[`${prefix}/${name}+${variant}`];
          if (hit !== undefined) return { source: hit, extension: "tse" } as never;
        }
        const plain = templates[`${prefix}/${name}`];
        return plain === undefined ? null : ({ source: plain, extension: "tse" } as never);
      },
      allTemplatePaths: () => Object.keys(templates),
    };
  }

  function contextWith(templates: Record<string, string>): LookupContext {
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(variantResolver(templates));
    return ctx;
  }

  it("resolves a nested partial against the variant the outer render used", async () => {
    const ctx = contextWith({
      "posts/index": '<%= render({ partial: "row" }) %>',
      "posts/_row": "plain-row",
      "posts/_row+phone": "phone-row",
    });

    const output = await ctx.render("posts", "index", "html", {}, { variants: ["phone"] });
    expect(output).toBe("phone-row");
  });

  it("falls back to the plain partial when no variant is active", async () => {
    const ctx = contextWith({
      "posts/index": '<%= render({ partial: "row" }) %>',
      "posts/_row": "plain-row",
      "posts/_row+phone": "phone-row",
    });

    const output = await ctx.render("posts", "index", "html", {}, {});
    expect(output).toBe("plain-row");
  });
});
