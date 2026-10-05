import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
import { setZone, setZoneDefault, useZone, zone, zoneDefault } from "./time-zone-config.js";
import { TimeZone } from "./values/time-zone.js";

describe("Time.use_zone", () => {
  let oldZoneDefault: TimeZone | null;

  beforeEach(() => {
    oldZoneDefault = zoneDefault();
    setZone(null);
  });

  afterEach(() => {
    setZoneDefault(oldZoneDefault);
    setZone(null);
  });

  it("keeps the zone set across an await and restores it when the block settles", async () => {
    setZone("Alaska");
    const promise = useZone("Hawaii", async () => {
      await Promise.resolve();
      return zone()?.name;
    });
    expect(zone()?.name).toBe("Hawaii");
    expect(await promise).toBe("Hawaii");
    expect(zone()?.name).toBe("Alaska");
  });

  it("restores the zone when an async block rejects", async () => {
    setZone("Alaska");
    const promise = useZone("Hawaii", async () => {
      await Promise.resolve();
      throw new Error("boom");
    });
    await expect(promise).rejects.toThrow("boom");
    expect(zone()?.name).toBe("Alaska");
  });

  it("restores the reader's value, so an unset zone becomes the default", () => {
    setZoneDefault(TimeZone.find("Alaska"));
    useZone("Hawaii", () => {});
    setZoneDefault(TimeZone.find("Hawaii"));
    expect(zone()?.name).toBe("Alaska");
  });

  it("does not leak the zone between concurrent execution contexts", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const inZone = (name: string) =>
      new Thread(() =>
        useZone(name, async () => {
          await gate;
          return zone()?.name;
        }),
      ).value();
    const hawaii = inZone("Hawaii");
    const alaska = inZone("Alaska");
    expect(zone()).toBeNull();
    release();
    expect(await Promise.all([hawaii, alaska])).toEqual(["Hawaii", "Alaska"]);
    expect(zone()).toBeNull();
  });
});
