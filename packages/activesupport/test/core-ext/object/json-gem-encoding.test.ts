import { describe, it } from "vitest";

describe("JsonGemEncodingTest", () => {
  // PERMANENT-SKIP: the test asserts that loading `core_ext/object/json` leaves the JSON gem's output unchanged; trails patches no native prototype, so `JSON.stringify` has no with-or-without-ActiveSupport arm (CLAUDE.md, "Core extensions are not installed on native prototypes (`config.active_support.bare`)").
  it.skip(" ");
  // PERMANENT-SKIP: the test asserts that loading `core_ext/object/json` leaves the JSON gem's output unchanged; trails patches no native prototype, so `JSON.stringify` has no with-or-without-ActiveSupport arm (CLAUDE.md, "Core extensions are not installed on native prototypes (`config.active_support.bare`)").
  it.skip("custom to_json");
});
