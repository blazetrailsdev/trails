import { describe, it, expect, afterEach } from "vitest";
import { Generators } from "../../lib/generators.js";

describe("Generators.hiddenNamespaces (trails-only)", () => {
  const original = { ...Generators.options().trails };

  afterEach(() => {
    const trails = Generators.options().trails;
    for (const key of Object.keys(trails)) delete trails[key];
    Object.assign(trails, original);
  });

  it("spells the configured orm, test framework and template engine in kebab-case", () => {
    Object.assign(Generators.options().trails, {
      orm: "active_record",
      testFramework: "test_unit",
      templateEngine: "tse",
    });

    const hidden = Generators.hiddenNamespaces();

    expect(hidden).toContain("active-record:model");
    expect(hidden).toContain("test-unit:model");
    expect(hidden).toContain("tse:mailer");
    expect(hidden).not.toContain("active_record:model");
  });
});
