import { describe, it, expect } from "vitest";
import {
  buildCatalog,
  callToken,
  catalogueDivergent,
  catalogueMissing,
  skeletonDiff,
  type ExcludeEntry,
} from "./catalog.js";

const entry = (over: Partial<ExcludeEntry> = {}): ExcludeEntry => ({
  package: "activerecord",
  tsFile: "persistence.ts",
  rubyName: "save",
  call: "create_or_update",
  reason: "Confirmed equivalent (RFC 0044).",
  ...over,
});

describe("prism-codegen deviation catalog", () => {
  it("tokens a Ruby call the way the scorer tokens the TS body", () => {
    expect(callToken("create_or_update")).toBe("ref:createOrUpdate");
    // `size` → `length` and the `is`/`perform` prefixes are canonicalized by the
    // scorer, so the exclude list's Ruby spelling has to land on the same token.
    expect(callToken("size")).toBe("ref:length");
  });

  it("reports the multiset difference of two skeletons in both directions", () => {
    expect(skeletonDiff("if ref:a ref:b", "if ref:b")).toEqual(["ref:a"]);
    expect(skeletonDiff("if ref:b", "if ref:a ref:b")).toEqual(["ref:a"]);
    expect(skeletonDiff("if ref:a", "ref:a if")).toEqual([]);
  });

  it("catalogs a missing def whose Ruby name is on api-compare's SKIP list", () => {
    const catalog = buildCatalog([]);
    expect(catalogueMissing(catalog, "dup", "active_record/persistence.rb")).toMatch(/SKIP: dup/);
    expect(catalogueMissing(catalog, "save", "active_record/persistence.rb")).toBeUndefined();
  });

  it("catalogs a divergence whose every differing token is an excluded call", () => {
    const catalog = buildCatalog([entry(), entry({ call: "touch_later" })]);
    const reason = catalogueDivergent(
      catalog,
      "persistence.ts",
      "save",
      "if ref:createOrUpdate ref:touchLater",
      "if",
    );
    expect(reason).toContain("RFC 0044");
  });

  it("keeps a divergence in the residue when one differing token is unexplained", () => {
    const catalog = buildCatalog([entry()]);
    expect(
      catalogueDivergent(
        catalog,
        "persistence.ts",
        "save",
        "if ref:createOrUpdate ref:sneaky",
        "if",
      ),
    ).toBeUndefined();
    // A dropped control-flow token is never excusable by a call exclusion.
    expect(
      catalogueDivergent(catalog, "persistence.ts", "save", "if ref:createOrUpdate", ""),
    ).toBeUndefined();
  });

  it("scopes call exclusions to the file the entry was reviewed in", () => {
    const catalog = buildCatalog([entry()]);
    expect(
      catalogueDivergent(catalog, "core.ts", "save", "if ref:createOrUpdate", "if"),
    ).toBeUndefined();
  });
});
