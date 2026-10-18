import { afterEach, beforeEach, describe, it } from "vitest";
import { assertEqual, assertNil } from "@blazetrails/activesupport";
import { FixtureResolver } from "../../testing/resolvers.js";
import { TemplateHandlers } from "../handlers.js";
import { Tse } from "../handlers/tse.js";

describe("FixtureResolverTest", () => {
  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
  });

  afterEach(() => {
    TemplateHandlers.clear();
  });

  it("should return empty list for unknown path", () => {
    const resolver = new FixtureResolver();
    const templates = resolver.findAll("path", "arbitrary", false, {
      locale: [],
      formats: [":html"],
      variants: [],
      handlers: [],
    });
    assertEqual([], templates, "expected an empty list of templates");
  });

  it("should return template for declared path", () => {
    const resolver = new FixtureResolver({ "arbitrary/path.tse": "this text" });
    const templates = resolver.findAll("path", "arbitrary", false, {
      locale: [],
      formats: [":html"],
      variants: [],
      handlers: [":tse"],
    });
    assertEqual(1, templates.length, "expected one template");
    assertEqual("this text", templates[0].source);
    assertEqual("arbitrary/path", templates[0].virtualPath);
    assertNil(templates[0].format);
  });

  it("should match templates with variants", () => {
    const resolver = new FixtureResolver({ "arbitrary/path.html+variant.tse": "this text" });
    const templates = resolver.findAll("path", "arbitrary", false, {
      locale: [],
      formats: [":html"],
      variants: [":variant"],
      handlers: [":tse"],
    });
    assertEqual(1, templates.length, "expected one template");
    assertEqual("this text", templates[0].source);
    assertEqual("arbitrary/path", templates[0].virtualPath);
    assertEqual(":html", templates[0].format);
    assertEqual("variant", templates[0].variant);
  });

  it("should match locales", () => {
    const resolver = new FixtureResolver({
      "arbitrary/path.tse": "this text",
      "arbitrary/path.fr.tse": "ce texte",
    });
    const en = resolver.findAll("path", "arbitrary", false, {
      locale: [":en"],
      formats: [":html"],
      variants: [],
      handlers: [":tse"],
    });
    const fr = resolver.findAll("path", "arbitrary", false, {
      locale: [":fr"],
      formats: [":html"],
      variants: [],
      handlers: [":tse"],
    });

    assertEqual(1, en.length);
    assertEqual(2, fr.length);

    assertEqual("this text", en[0].source);
    assertEqual("ce texte", fr[0].source);
    assertEqual("this text", fr[1].source);
  });

  it("should return all variants for any", () => {
    const resolver = new FixtureResolver({
      "arbitrary/path.html.tse": "this html",
      "arbitrary/path.html+variant.tse": "this text",
    });
    let templates = resolver.findAll("path", "arbitrary", false, {
      locale: [],
      formats: [":html"],
      variants: [],
      handlers: [":tse"],
    });
    assertEqual(1, templates.length, "expected one template");
    assertEqual("this html", templates[0].source);
    templates = resolver.findAll("path", "arbitrary", false, {
      locale: [],
      formats: [":html"],
      variants: "any",
      handlers: [":tse"],
    });
    assertEqual(2, templates.length, "expected all templates");
  });
});
