import { describe, expect, it } from "vitest";
import { TimeZone, toFs } from "@blazetrails/activesupport";
import { cacheKey, cacheVersion } from "./integration.js";

describe("Integration with a TimeWithZone updated_at", () => {
  const twz = TimeZone.find("America/New_York")!.local(2026, 4, 28, 12, 30, 45);
  const utc = toFs(twz.utc(), "usec");

  function host(cacheVersioning: boolean): ThisParameterType<typeof cacheKey> {
    class Model {
      static cacheVersioning = cacheVersioning;
      static modelName = { cacheKey: "models" };
      static attributeAliases = {};
    }
    return Object.assign(new Model(), {
      id: 1,
      isNewRecord: () => false,
      hasAttribute: (name: string) => name === "updated_at",
      _readAttribute: () => twz,
      readAttribute: () => twz,
      readAttributeBeforeTypeCast: () => twz,
    }) as unknown as ThisParameterType<typeof cacheKey>;
  }

  it("cache_version renders timestamp.utc.to_fs (integration.rb:106)", () => {
    expect(cacheVersion.call(host(true))).toBe(utc);
  });

  it("cache_key renders timestamp.utc.to_fs (integration.rb:82)", () => {
    expect(cacheKey.call(host(false))).toBe(`models/1-${utc}`);
  });
});
