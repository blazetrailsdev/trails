import { describe, expect, it } from "vitest";

import {
  closesStoryIds,
  closingStoryReferences,
  formatFindings,
} from "./closing-story-references.js";
import { extractStoryReferences, type StoryReference } from "./stale-story-references.js";

describe("closesStoryIds", () => {
  it("parses the trailer case-insensitively", () => {
    expect(closesStoryIds("Body text.\n\nCloses-story: some-landed-story\n")).toEqual([
      "some-landed-story",
    ]);
    expect(closesStoryIds("closes-story:   some-landed-story  ")).toEqual(["some-landed-story"]);
    expect(closesStoryIds("CLOSES-STORY: Some-Landed-Story")).toEqual(["some-landed-story"]);
  });

  it("parses every trailer a bundle PR carries", () => {
    const body = [
      "## Summary",
      "",
      "Closes-story: first-bundled-story",
      "Closes-story: second-bundled-story",
      "Closes-story: first-bundled-story",
    ].join("\n");
    expect(closesStoryIds(body)).toEqual(["first-bundled-story", "second-bundled-story"]);
  });

  it("ignores prose that merely mentions the phrase mid-line", () => {
    expect(closesStoryIds("This PR closes-story: nothing at all really")).toEqual([]);
    expect(closesStoryIds("no trailer here")).toEqual([]);
  });
});

describe("closingStoryReferences", () => {
  // The #7077 comment, verbatim: `a8e658cb` deleted
  // AbstractMysqlAdapter#lookupCastType and closed the story, but left this
  // sentence at abstract-adapter.ts:2746. #7083 was the mop-up.
  const SEVEN_OH_SEVEN_SEVEN = [
    "  /**",
    "   * The `Promise<Type>` arm is not Rails: `PostgreSQLAdapter#lookupCastType`",
    "   * resolves a sql_type with a live regtype query, so its override is async",
    "   * (tracked by `pg-lookup-cast-type-async-divergence`). The `null` arm is",
    "   * `AbstractMysqlAdapter`'s early return for an empty sql_type, which",
    "   * `mysql-native-type-map-converges-onto-type-map` deletes.",
    "   */",
  ].join("\n");

  const refsFor = (source: string, file = "packages/activerecord/src/x.ts"): StoryReference[] =>
    extractStoryReferences(source, file);

  it("flags a citation of a story the PR declares closed", () => {
    const body = "Closes-story: mysql-native-type-map-converges-onto-type-map";
    const findings = closingStoryReferences(
      refsFor(SEVEN_OH_SEVEN_SEVEN),
      new Set(closesStoryIds(body)),
    );
    expect(findings.map((f) => f.slug)).toEqual(["mysql-native-type-map-converges-onto-type-map"]);
    expect(formatFindings(findings)).toContain("packages/activerecord/src/x.ts:1");
  });

  it("clears once the citation is deleted, as #7083 did", () => {
    const fixed = SEVEN_OH_SEVEN_SEVEN.split("\n")
      .filter((line) => !line.includes("mysql-native-type-map"))
      .join("\n");
    const body = "Closes-story: mysql-native-type-map-converges-onto-type-map";
    expect(closingStoryReferences(refsFor(fixed), new Set(closesStoryIds(body)))).toEqual([]);
  });

  it("leaves a citation of a story the PR does not close alone", () => {
    // The same block cites `pg-lookup-cast-type-async-divergence`, which this
    // PR says nothing about.
    const body = "Closes-story: some-other-unrelated-story";
    expect(
      closingStoryReferences(refsFor(SEVEN_OH_SEVEN_SEVEN), new Set(closesStoryIds(body))),
    ).toEqual([]);
  });

  it("leaves a provenance citation alone", () => {
    const source = [
      "  // Regression for `activesupport-json-encoding-time-precision`, which",
      "  // landed (#5971) without updating this assertion.",
    ].join("\n");
    const body = "Closes-story: activesupport-json-encoding-time-precision";
    expect(closingStoryReferences(refsFor(source), new Set(closesStoryIds(body)))).toEqual([]);
  });

  it("flags the #5971 shape when the promise is still pending", () => {
    const source = [
      "  // The pre-convergence value is asserted here; the real one is",
      "  // deferred to `activesupport-json-encoding-time-precision`.",
    ].join("\n");
    const body = "Closes-story: activesupport-json-encoding-time-precision";
    const findings = closingStoryReferences(refsFor(source), new Set(closesStoryIds(body)));
    expect(findings.map((f) => f.slug)).toEqual(["activesupport-json-encoding-time-precision"]);
  });
});
