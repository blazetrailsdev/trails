import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
import { setZone, setZoneDefault, useZone, zone, zoneDefault } from "./time-zone-config.js";
import { TimeZone } from "./values/time-zone.js";

describe("Time.use_zone", () => {
  let oldZoneDefault: TimeZone | null | false;

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
      return (zone() as TimeZone | null)?.name;
    });
    expect((zone() as TimeZone | null)?.name).toBe("Hawaii");
    expect(await promise).toBe("Hawaii");
    expect((zone() as TimeZone | null)?.name).toBe("Alaska");
  });

  it("restores the zone when an async block rejects", async () => {
    setZone("Alaska");
    const promise = useZone("Hawaii", async () => {
      await Promise.resolve();
      throw new Error("boom");
    });
    await expect(promise).rejects.toThrow("boom");
    expect((zone() as TimeZone | null)?.name).toBe("Alaska");
  });

  it("restores the reader's value, so an unset zone becomes the default", () => {
    setZoneDefault(TimeZone.find("Alaska"));
    useZone("Hawaii", () => {});
    setZoneDefault(TimeZone.find("Hawaii"));
    expect((zone() as TimeZone | null)?.name).toBe("Alaska");
  });

  it("returns a lazy thenable unevaluated, as Ruby returns an unloaded relation", () => {
    let evaluated = false;
    const relation = {
      then(resolve: (value: string) => void) {
        evaluated = true;
        resolve("loaded");
      },
    };
    expect(useZone("Hawaii", () => relation)).toBe(relation);
    expect(evaluated).toBe(false);
    expect(zone()).toBeNull();
  });

  it("does not leak the zone between concurrent execution contexts", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const inZone = (name: string) =>
      new Thread(() =>
        useZone(name, async () => {
          await gate;
          return (zone() as TimeZone | null)?.name;
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
