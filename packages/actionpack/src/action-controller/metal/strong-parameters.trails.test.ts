import { describe, it, expect, expectTypeOf } from "vitest";
import { Parameters, UnpermittedParameters } from "./strong-parameters.js";

describe("Parameters#unpermitted_parameters!", () => {
  it("raises on_unpermitted: :raise regardless of the class default", () => {
    const params = new Parameters({ name: "John", admin: true });
    expect(() =>
      params.unpermittedParametersBang(new Parameters({ name: "John" }), {
        onUnpermitted: "raise",
      }),
    ).toThrow(new UnpermittedParameters(["admin"]).message);
  });
});

describe("Parameters#expect types", () => {
  const params = new Parameters({
    id: "1",
    post: { title: "Hi", body: "There" },
    comment: { text: "ok" },
  });

  it("a single hash filter returns the permitted Parameters", () => {
    const post = params.expect({ post: ["title", "body"] });
    expectTypeOf(post).toEqualTypeOf<Parameters>();
    expect(post).toBeInstanceOf(Parameters);
    expect(post.permitted).toBe(true);
    expectTypeOf(params.expectBang({ post: ["title"] })).toEqualTypeOf<Parameters>();
  });

  it("a hash naming several keys returns one Parameters per key", () => {
    const values = params.expect({ post: ["title"], comment: ["text"] });
    expectTypeOf(values).toEqualTypeOf<Parameters[]>();
    expect(values).toHaveLength(2);
  });

  it("a scalar key returns the scalar", () => {
    const id = params.expect("id");
    expectTypeOf(id).toBeUnknown();
    expect(id).toBe("1");
  });
});
