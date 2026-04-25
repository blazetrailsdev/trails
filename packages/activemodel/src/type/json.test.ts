import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("JsonType", () => {
  it("casts a JSON string to parsed object", () => {
    class Config extends Model {
      static {
        this.attribute("data", "json");
      }
    }
    const c = new Config({ data: '{"key":"value"}' });
    expect(c.readAttribute("data")).toEqual({ key: "value" });
  });

  it("passes through objects", () => {
    class Config extends Model {
      static {
        this.attribute("data", "json");
      }
    }
    const c = new Config({ data: { key: "value" } });
    expect(c.readAttribute("data")).toEqual({ key: "value" });
  });

  it("returns null for invalid JSON string", () => {
    class Config extends Model {
      static {
        this.attribute("data", "json");
      }
    }
    const c = new Config({ data: "not json{" });
    expect(c.readAttribute("data")).toBe(null);
  });

  it("handles arrays", () => {
    class Config extends Model {
      static {
        this.attribute("tags", "json");
      }
    }
    const c = new Config({ tags: [1, 2, 3] });
    expect(c.readAttribute("tags")).toEqual([1, 2, 3]);
  });

  it("handles null", () => {
    class Config extends Model {
      static {
        this.attribute("data", "json");
      }
    }
    const c = new Config({});
    expect(c.readAttribute("data")).toBe(null);
  });
});
