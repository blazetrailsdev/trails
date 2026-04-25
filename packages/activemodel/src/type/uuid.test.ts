import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("UuidType", () => {
  it("casts a valid UUID to lowercase", () => {
    class Item extends Model {
      static {
        this.attribute("uuid", "uuid");
      }
    }
    const item = new Item({ uuid: "550E8400-E29B-41D4-A716-446655440000" });
    expect(item.readAttribute("uuid")).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("returns null for invalid UUID", () => {
    class Item extends Model {
      static {
        this.attribute("uuid", "uuid");
      }
    }
    const item = new Item({ uuid: "not-a-uuid" });
    expect(item.readAttribute("uuid")).toBe(null);
  });

  it("handles null", () => {
    class Item extends Model {
      static {
        this.attribute("uuid", "uuid");
      }
    }
    const item = new Item({});
    expect(item.readAttribute("uuid")).toBe(null);
  });

  it("accepts dashless UUID format", () => {
    class Item extends Model {
      static {
        this.attribute("uuid", "uuid");
      }
    }
    const item = new Item({ uuid: "550e8400e29b41d4a716446655440000" });
    expect(item.readAttribute("uuid")).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("accepts braced UUID format", () => {
    class Item extends Model {
      static {
        this.attribute("uuid", "uuid");
      }
    }
    const item = new Item({ uuid: "{550e8400-e29b-41d4-a716-446655440000}" });
    expect(item.readAttribute("uuid")).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("accepts braced dashless UUID format", () => {
    class Item extends Model {
      static {
        this.attribute("uuid", "uuid");
      }
    }
    const item = new Item({ uuid: "{550E8400E29B41D4A716446655440000}" });
    expect(item.readAttribute("uuid")).toBe("550e8400-e29b-41d4-a716-446655440000");
  });
});
