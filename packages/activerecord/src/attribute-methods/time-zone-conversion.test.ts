/**
 * Tests for TimeZoneConversion wiring on Base.
 *
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversionTest
 */
import { describe, it, expect, beforeEach } from "vitest";
import { typeRegistry } from "@blazetrails/activemodel";
import { Base } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { loadSchemaFromAdapter } from "../model-schema.js";
import { TimeZoneConverter } from "./time-zone-conversion.js";

describe("TimeZoneConversionTest", () => {
  beforeEach(() => {
    createTestAdapter();
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
