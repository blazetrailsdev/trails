import { describe, it, expect } from "vitest";
import { canonicalModelIndex } from "./canonical-model-index.js";
import { resolveModel } from "../associations.js";
import { Comment } from "./models/comment.js";
import { Owner } from "./models/owner.js";

describe("canonical model autoload index (Zeitwerk analog)", () => {
  it("indexes canonical models by their class name", () => {
    // Association-target-only models (no fixture set of their own) are present
    // so they resolve on first reference without a manual `registerModel`.
    expect(canonicalModelIndex.get("Comment")).toBe(Comment);
    expect(canonicalModelIndex.get("Owner")).toBe(Owner);
  });

  it("resolveModel autoloads an indexed model on a registry miss", () => {
    // Whether or not another test already registered it, resolveModel returns
    // the canonical class — the fallback covers the un-registered case.
    expect(resolveModel("Comment")).toBe(Comment);
    expect(resolveModel("Owner")).toBe(Owner);
  });

  it("throws a constant-not-found error for a genuine miss", () => {
    // A name in neither the registry nor the index must still throw, so the
    // fallback can never silently mask a missing or misnamed model.
    expect(() => resolveModel("NoSuchCanonicalModel")).toThrow(
      /uninitialized constant NoSuchCanonicalModel/,
    );
  });
});
