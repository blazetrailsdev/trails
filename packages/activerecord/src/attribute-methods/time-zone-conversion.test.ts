/**
 * Tests for TimeZoneConversion wiring on Base.
 *
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversionTest
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
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
});
