import { describe, expect, it } from "vitest";
import { buildGemfileContent } from "./build-gemfile.js";

describe("scripts/parity/schema/ruby/build-gemfile.ts", () => {
  it("derives activerecord version from vendor/sources.ts rails ref", () => {
    const content = buildGemfileContent();
    // Rails ref is "v8.0.2" in sources.ts → "8.0.2" gem version (v stripped).
    expect(content).toContain('gem "activerecord", "8.0.2"');
  });

  it("includes the GENERATED banner so contributors know not to hand-edit", () => {
    expect(buildGemfileContent()).toMatch(/GENERATED from vendor\/sources\.ts/);
  });

  it("preserves sqlite3 and minitest dependencies", () => {
    const content = buildGemfileContent();
    expect(content).toContain("sqlite3");
    expect(content).toContain("minitest");
  });

  it("committed Gemfile matches the generated content (drift forcing function)", async () => {
    // If sources.ts bumped the rails ref but nobody re-ran parity, the
    // committed Gemfile lags. CI catches it at runRails time, but this test
    // catches it at PR review time alongside the wave-3 lockfile-sync and
    // wave-4 pinned-PACKAGES tests.
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const onDisk = readFileSync(join(here, "Gemfile"), "utf8");
    expect(onDisk).toBe(buildGemfileContent());
  });
});
