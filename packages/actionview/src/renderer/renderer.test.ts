import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Renderer } from "./renderer.js";
import { TemplateRenderer } from "./template-renderer.js";
import { PartialRenderer, ObjectRenderer, CollectionRenderer } from "./partial-renderer.js";
import { LookupContext } from "../lookup-context.js";
import type { ViewContext } from "./abstract-renderer.js";

const makeLookupContext = () => new LookupContext();

const ctx: ViewContext = {};

describe("Renderer dispatch", () => {
  let renderer: Renderer;

  beforeEach(() => {
    renderer = new Renderer(makeLookupContext());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes to TemplateRenderer when no partial: key is present", () => {
    vi.spyOn(TemplateRenderer.prototype, "render").mockImplementation(() => {
      throw new Error("TemplateRenderer reached");
    });
    expect(() => renderer.render(ctx, { template: "posts/show" })).toThrow(
      "TemplateRenderer reached",
    );
  });

  it("routes to PartialRenderer for string partial without collection or object", () => {
    vi.spyOn(PartialRenderer.prototype, "render").mockImplementation(() => {
      throw new Error("PartialRenderer reached");
    });
    expect(() => renderer.render(ctx, { partial: "posts/card" })).toThrow(
      "PartialRenderer reached",
    );
  });

  it("routes to CollectionRenderer for string partial with collection:", () => {
    vi.spyOn(CollectionRenderer.prototype, "renderCollectionWithPartial").mockImplementation(() => {
      throw new Error("CollectionRenderer reached");
    });
    expect(() => renderer.render(ctx, { partial: "posts/card", collection: [1, 2] })).toThrow(
      "CollectionRenderer reached",
    );
  });

  it("routes to CollectionRenderer for string partial with empty collection", () => {
    vi.spyOn(CollectionRenderer.prototype, "renderCollectionWithPartial").mockImplementation(() => {
      throw new Error("CollectionRenderer reached");
    });
    expect(() => renderer.render(ctx, { partial: "posts/card", collection: [] })).toThrow(
      "CollectionRenderer reached",
    );
  });

  it("routes to ObjectRenderer for string partial with object:", () => {
    vi.spyOn(ObjectRenderer.prototype, "renderObjectWithPartial").mockImplementation(() => {
      throw new Error("ObjectRenderer reached");
    });
    expect(() => renderer.render(ctx, { partial: "posts/card", object: { id: 1 } })).toThrow(
      "ObjectRenderer reached",
    );
  });

  it("routes to CollectionRenderer for object partial with toAry()", () => {
    vi.spyOn(CollectionRenderer.prototype, "renderCollectionDerivePartial").mockImplementation(
      () => {
        throw new Error("CollectionRenderer derive reached");
      },
    );
    const objectWithToAry = { toAry: () => [1, 2] };
    expect(() => renderer.render(ctx, { partial: objectWithToAry })).toThrow(
      "CollectionRenderer derive reached",
    );
  });

  it("routes to ObjectRenderer for object partial without toAry()", () => {
    vi.spyOn(ObjectRenderer.prototype, "renderObjectDerivePartial").mockImplementation(() => {
      throw new Error("ObjectRenderer derive reached");
    });
    expect(() => renderer.render(ctx, { partial: { toPartialPath: () => "posts/card" } })).toThrow(
      "ObjectRenderer derive reached",
    );
  });

  it("cacheHits accumulates across renders", () => {
    renderer.cacheHits["posts/card"] = 3;
    expect(renderer.cacheHits["posts/card"]).toBe(3);
  });
});
