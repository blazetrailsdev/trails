import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { platformInfo, tzinfoDataVersion, tzinfoVersion } from "../lib/info.js";

describe("EtOrbi tzinfo versions", () => {
  it("reads the tzinfo version from @blazetrails/tzinfo's package.json", () => {
    const { version } = createRequire(import.meta.url)("@blazetrails/tzinfo/package.json");
    expect(tzinfoVersion()).toBe(version);
    expect(platformInfo()).toContain(`tziv:"${version}"`);
  });

  it("answers nil for tzinfo-data, which has no package", () => {
    expect(tzinfoDataVersion()).toBeNull();
    expect(platformInfo()).toContain("tzidv:nil");
  });
});
