import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PartialRenderer,
  ObjectRenderer,
  CollectionRenderer,
  PartialIteration,
} from "./partial-renderer.js";
import { LookupContext, MissingTemplate } from "../lookup-context.js";
import type { RenderableTemplate, ViewContext } from "./abstract-renderer.js";

function makeFakeTemplate(body = "body"): RenderableTemplate {
  return {
    identifier: "fake",
    format: "html",
    render: vi.fn().mockResolvedValue(body),
  };
}

const ctx: ViewContext = {};

describe("PartialRenderer", () => {
  let lc: LookupContext;
  beforeEach(() => {
    lc = new LookupContext();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a bare partial", async () => {
    vi.spyOn(lc, "findPartial").mockReturnValue(makeFakeTemplate("partial body") as never);
    const result = await new PartialRenderer(lc).render("users/card", ctx, undefined);
    expect(result.body).toBe("partial body");
  });

  it("renders a partial with locals", async () => {
    const fake = makeFakeTemplate("Hello Alice");
    vi.spyOn(lc, "findPartial").mockReturnValue(fake as never);
    await new PartialRenderer(lc, { locals: { name: "Alice" } }).render(
      "users/card",
      ctx,
      undefined,
    );
    expect(fake.render).toHaveBeenCalledWith({ name: "Alice" }, ctx);
  });

  it("looks up partial with underscore prefix", async () => {
    const spy = vi.spyOn(lc, "findPartial").mockReturnValue(null);
    await new PartialRenderer(lc).render("users/card", ctx, undefined).catch(() => {});
    expect(spy).toHaveBeenCalledWith("card", "users", "html");
  });

  it("raises MissingTemplate when partial cannot be found", async () => {
    vi.spyOn(lc, "findPartial").mockReturnValue(null);
    await expect(
      new PartialRenderer(lc).render("users/missing", ctx, undefined),
    ).rejects.toBeInstanceOf(MissingTemplate);
  });
});

describe("ObjectRenderer", () => {
  let lc: LookupContext;
  beforeEach(() => {
    lc = new LookupContext();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("binds object under local variable derived from partial path", async () => {
    const fake = makeFakeTemplate("user body");
    vi.spyOn(lc, "findPartial").mockReturnValue(fake as never);
    const user = { name: "Alice" };
    await new ObjectRenderer(lc).renderObjectWithPartial(user, "users/user", ctx, undefined);
    expect(fake.render).toHaveBeenCalledWith(expect.objectContaining({ user }), ctx);
  });

  it("binds object under the as: option name", async () => {
    const fake = makeFakeTemplate();
    vi.spyOn(lc, "findPartial").mockReturnValue(fake as never);
    const user = { name: "Alice" };
    await new ObjectRenderer(lc, { as: "person" }).renderObjectWithPartial(
      user,
      "users/user",
      ctx,
      undefined,
    );
    expect(fake.render).toHaveBeenCalledWith(expect.objectContaining({ person: user }), ctx);
  });

  it("derives partial path from toPartialPath()", async () => {
    vi.spyOn(lc, "findPartial").mockReturnValue(makeFakeTemplate("account body") as never);
    const result = await new ObjectRenderer(lc).renderObjectDerivePartial(
      { toPartialPath: () => "accounts/account" },
      ctx,
      undefined,
    );
    expect(result.body).toBe("account body");
  });

  it("raises when object has no toPartialPath", async () => {
    await expect(
      new ObjectRenderer(lc).renderObjectDerivePartial({ id: 1 }, ctx, undefined),
    ).rejects.toThrow("toPartialPath");
  });
});

describe("CollectionRenderer", () => {
  let lc: LookupContext;
  beforeEach(() => {
    lc = new LookupContext();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders each element in a collection", async () => {
    const fake = makeFakeTemplate();
    (fake.render as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("Alice")
      .mockResolvedValueOnce("Bob");
    vi.spyOn(lc, "findPartial").mockReturnValue(fake as never);
    const result = await new CollectionRenderer(lc).renderCollectionWithPartial(
      ["a", "b"],
      "users/user",
      ctx,
      undefined,
    );
    expect(result.body).toBe("AliceBob");
  });

  it("returns empty body for an empty collection", async () => {
    const result = await new CollectionRenderer(lc).renderCollectionWithPartial(
      [],
      "users/user",
      ctx,
      undefined,
    );
    expect(result.body).toBe("");
  });

  it("exposes ${as}_counter and ${as}_iteration locals", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fake: RenderableTemplate = {
      identifier: "f",
      format: "html",
      render: vi.fn().mockImplementation((l: Record<string, unknown>) => {
        calls.push({ ...l });
        return Promise.resolve("x");
      }),
    };
    vi.spyOn(lc, "findPartial").mockReturnValue(fake as never);
    await new CollectionRenderer(lc).renderCollectionWithPartial(
      ["a", "b"],
      "users/user",
      ctx,
      undefined,
    );
    expect(calls[0]).toMatchObject({ user: "a", user_counter: 0 });
    expect(calls[1]).toMatchObject({ user: "b", user_counter: 1 });
    expect(calls[0]!["user_iteration"]).toBeInstanceOf(PartialIteration);
  });

  it("uses as: option to name the collection variable", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fake: RenderableTemplate = {
      identifier: "f",
      format: "html",
      render: vi.fn().mockImplementation((l: Record<string, unknown>) => {
        calls.push({ ...l });
        return Promise.resolve("x");
      }),
    };
    vi.spyOn(lc, "findPartial").mockReturnValue(fake as never);
    await new CollectionRenderer(lc, { as: "person" }).renderCollectionWithPartial(
      ["a"],
      "users/user",
      ctx,
      undefined,
    );
    expect(calls[0]).toMatchObject({ person: "a", person_counter: 0 });
  });

  it("renders spacer_template between items", async () => {
    const itemTmpl = makeFakeTemplate();
    (itemTmpl.render as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("A")
      .mockResolvedValueOnce("B");
    const spacerTmpl = makeFakeTemplate("|");
    vi.spyOn(lc, "findPartial").mockImplementation(
      (name) => (name === "spacer" ? spacerTmpl : itemTmpl) as never,
    );
    const result = await new CollectionRenderer(lc, {
      spacerTemplate: "spacer",
    }).renderCollectionWithPartial(["a", "b"], "users/user", ctx, undefined);
    expect(result.body).toBe("A|B");
  });

  it("derives partial from toPartialPath() for homogeneous collection", async () => {
    const fake = makeFakeTemplate();
    (fake.render as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("P1")
      .mockResolvedValueOnce("P2");
    vi.spyOn(lc, "findPartial").mockReturnValue(fake as never);
    const posts = [{ toPartialPath: () => "posts/post" }, { toPartialPath: () => "posts/post" }];
    const result = await new CollectionRenderer(lc).renderCollectionDerivePartial(
      posts,
      ctx,
      undefined,
    );
    expect(result.body).toBe("P1P2");
  });
});

describe("PartialIteration", () => {
  it("tracks index, first, and last", () => {
    const iter = new PartialIteration(3);
    expect(iter.first).toBe(true);
    expect(iter.last).toBe(false);
    iter.iterate();
    expect(iter.index).toBe(1);
    iter.iterate();
    expect(iter.last).toBe(true);
  });
});
