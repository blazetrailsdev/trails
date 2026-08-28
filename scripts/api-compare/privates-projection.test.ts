import { describe, it, expect } from "vitest";
import { projectPrivateNames, type Visibility } from "./privates-projection.js";

describe("projectPrivateNames", () => {
  const map = (entries: Array<[string, Visibility]>) => new Map<string, Visibility>(entries);

  it("keeps a name private on every contributor", () => {
    expect(projectPrivateNames(map([["compute_type", "all-private"]]))).toContain("computeType");
  });

  it("retracts a private `?` method whose bare stem is public beside it", () => {
    const names = map([
      ["content_security_policy?", "all-private"],
      ["content_security_policy", "mixed"],
    ]);
    expect(projectPrivateNames(names).has("contentSecurityPolicy")).toBe(false);
  });

  it("keeps a private reader whose only public sibling is its writer", () => {
    // attr_writer :tagged_logger beside a private tagged_logger
    // (activesupport/lib/active_support/testing/tagged_logging.rb:8, :22).
    const names = map([
      ["tagged_logger", "all-private"],
      ["tagged_logger=", "mixed"],
    ]);
    const tsNames = projectPrivateNames(names);
    expect(tsNames.has("taggedLogger")).toBe(true);
    expect(tsNames.has("setTaggedLogger")).toBe(false);
  });

  it("retracts a public writer's own spellings when the reader is public too", () => {
    const names = map([
      ["tagged_logger", "mixed"],
      ["tagged_logger=", "mixed"],
    ]);
    expect(projectPrivateNames(names).size).toBe(0);
  });
});
