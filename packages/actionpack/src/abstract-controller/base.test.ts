import { describe, expect, it } from "vitest";

import { AbstractController, ActionNotFound } from "./base.js";

describe("ActionNotFound#corrections", () => {
  class FakeCtrl extends AbstractController {
    index(): void {}
    show(): void {}
    create(): void {}
    destroy(): void {}
  }

  it("returns close action names within edit distance 2", () => {
    const ctrl = new FakeCtrl();
    const err = new ActionNotFound("not found", ctrl, "indx");
    expect(err.corrections()).toContain("index");
  });

  it("returns an empty list when nothing is close", () => {
    const ctrl = new FakeCtrl();
    const err = new ActionNotFound("not found", ctrl, "completelyDifferent");
    expect(err.corrections()).toEqual([]);
  });

  it("memoizes the computed list", () => {
    const ctrl = new FakeCtrl();
    const err = new ActionNotFound("not found", ctrl, "indx");
    const first = err.corrections();
    const second = err.corrections();
    expect(second).toBe(first);
  });

  it("returns an empty list when controller or action is absent", () => {
    expect(new ActionNotFound("x").corrections()).toEqual([]);
  });
});
