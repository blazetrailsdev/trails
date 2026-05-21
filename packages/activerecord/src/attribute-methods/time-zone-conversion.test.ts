/**
 * Tests for TimeZoneConversion wiring on Base.
 *
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversionTest
 */
import { describe, it, expect, beforeEach } from "vitest";
import { typeRegistry, Types } from "@blazetrails/activemodel";
import { TimeWithZone, TimeZone } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Base } from "../index.js";
import { createSidecarTestAdapter } from "../test-adapter.js";
import { loadSchemaFromAdapter } from "../model-schema.js";
import { TimeZoneConverter } from "./time-zone-conversion.js";

describe("TimeZoneConversionTest", () => {
  beforeEach(() => {
    createSidecarTestAdapter();
  });

  it("wraps datetime attribute when timeZoneAwareAttributes is true", () => {
    class Post extends Base {
      static {
        this.timeZoneAwareAttributes = true;
        this.attribute("published_at", "datetime");
      }
    }
    const type = Post._attributeDefinitions.get("published_at")?.type;
    expect(type).toBeInstanceOf(TimeZoneConverter);
  });

  it("does not wrap datetime attribute when timeZoneAwareAttributes is false", () => {
    class Post extends Base {
      static {
        this.timeZoneAwareAttributes = false;
        this.attribute("published_at", "datetime");
      }
    }
    const type = Post._attributeDefinitions.get("published_at")?.type;
    expect(type).not.toBeInstanceOf(TimeZoneConverter);
  });

  it("does not wrap non-datetime attribute even when timeZoneAwareAttributes is true", () => {
    class Post extends Base {
      static {
        this.timeZoneAwareAttributes = true;
        this.attribute("title", "string");
      }
    }
    const type = Post._attributeDefinitions.get("title")?.type;
    expect(type).not.toBeInstanceOf(TimeZoneConverter);
  });

  it("does not wrap attribute listed in skipTimeZoneConversionForAttributes", () => {
    class Post extends Base {
      static {
        this.timeZoneAwareAttributes = true;
        this.skipTimeZoneConversionForAttributes = ["published_at"];
        this.attribute("published_at", "datetime");
      }
    }
    const type = Post._attributeDefinitions.get("published_at")?.type;
    expect(type).not.toBeInstanceOf(TimeZoneConverter);
  });

  it("wraps time attribute when timeZoneAwareAttributes is true", () => {
    class Post extends Base {
      static {
        this.timeZoneAwareAttributes = true;
        this.attribute("starts_at", "time");
      }
    }
    const type = Post._attributeDefinitions.get("starts_at")?.type;
    expect(type).toBeInstanceOf(TimeZoneConverter);
  });

  it("instance attribute type matches _attributeDefinitions after _defaultAttributes replay", () => {
    class Post extends Base {
      static {
        this.timeZoneAwareAttributes = true;
        this.attribute("published_at", "datetime");
      }
    }
    const defaults = Post._defaultAttributes();
    const attr = defaults.getAttribute("published_at");
    expect(attr?.type).toBeInstanceOf(TimeZoneConverter);
  });

  it("wraps schema-reflected datetime column when timeZoneAwareAttributes is true", async () => {
    const datetimeType = typeRegistry.lookup("datetime");
    const stringType = typeRegistry.lookup("string");
    const cols = {
      published_at: { sqlType: "datetime" },
      title: { sqlType: "string" },
    } as Record<string, unknown>;
    const adapter = {
      schemaCache: {
        dataSourceExists: async () => true,
        columnsHash: async () => cols,
        getCachedColumnsHash: () => cols,
        isCached: () => true,
      },
      lookupCastTypeFromColumn(col: { sqlType: string }) {
        return col.sqlType === "datetime" ? datetimeType : stringType;
      },
    };
    class Post extends Base {
      static {
        this.timeZoneAwareAttributes = true;
      }
      static override tableName = "posts";
    }
    (Post as unknown as { adapter: unknown }).adapter = adapter;
    await loadSchemaFromAdapter.call(Post);
    expect(Post._attributeDefinitions.get("published_at")?.type).toBeInstanceOf(TimeZoneConverter);
    expect(Post._attributeDefinitions.get("title")?.type).not.toBeInstanceOf(TimeZoneConverter);
  });
});

describe("TimeZoneConverter#isChanged", () => {
  const zone = new TimeZone("Europe/Paris");
  const MS1 = 1_000_000n; // exactly 1ms from epoch — clean boundary for all precision tests

  function converter(precision?: number) {
    return TimeZoneConverter.wrap(
      new Types.DateTimeType(precision !== undefined ? { precision } : {}),
    );
  }
  function twz(ns: bigint) {
    return new TimeWithZone(Temporal.Instant.fromEpochNanoseconds(ns), zone);
  }

  it("two distinct TimeWithZone wrapping the same instant are unchanged (DB round-trip)", () => {
    expect(converter().isChanged(twz(MS1), twz(MS1))).toBe(false);
  });

  it("TimeWithZone objects differing only in sub-microsecond are unchanged (precision=null defaults 6)", () => {
    expect(converter().isChanged(twz(MS1), twz(MS1 + 999n))).toBe(false);
  });

  it("TimeWithZone objects differing by one microsecond are changed (precision=null)", () => {
    expect(converter().isChanged(twz(MS1), twz(MS1 + 1000n))).toBe(true);
  });

  it("TimeWithZone objects differing only in sub-millisecond are unchanged (precision=3)", () => {
    expect(converter(3).isChanged(twz(MS1), twz(MS1 + 999_000n))).toBe(false);
  });

  it("TimeWithZone objects differing by one millisecond are changed (precision=3)", () => {
    expect(converter(3).isChanged(twz(MS1), twz(MS1 + 1_000_000n))).toBe(true);
  });

  it("Temporal.Instant values with same epoch are unchanged", () => {
    const a = Temporal.Instant.fromEpochNanoseconds(MS1);
    const b = Temporal.Instant.fromEpochNanoseconds(MS1);
    expect(converter().isChanged(a, b)).toBe(false);
  });

  it("null vs null is unchanged", () => {
    expect(converter().isChanged(null, null)).toBe(false);
  });

  it("null vs TimeWithZone is changed", () => {
    expect(converter().isChanged(null, twz(MS1))).toBe(true);
  });
});
