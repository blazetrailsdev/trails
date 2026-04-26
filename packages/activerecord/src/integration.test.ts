import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";

function withCacheVersioning(klass: typeof Base, fn: () => void) {
  const original = klass.cacheVersioning;
  klass.cacheVersioning = true;
  try {
    fn();
  } finally {
    klass.cacheVersioning = original;
  }
}

function expectedUsec(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const mo = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  const h = d.getUTCHours().toString().padStart(2, "0");
  const mi = d.getUTCMinutes().toString().padStart(2, "0");
  const s = d.getUTCSeconds().toString().padStart(2, "0");
  const ms = d.getUTCMilliseconds().toString().padStart(3, "0");
  return `${y}${mo}${day}${h}${mi}${s}${ms}000`;
}

describe("IntegrationTest", () => {
  it("to param should return string", async () => {
    class Client extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
      }
    }
    const record = await Client.create({ name: "Alice" });
    expect(typeof record.toParam()).toBe("string");
  });

  it("to param returns nil if not persisted", () => {
    class Client extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
      }
    }
    expect(new Client().toParam()).toBeNull();
  });

  it("to param returns id if not persisted but id is set", () => {
    class Client extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
      }
    }
    const c = new Client();
    c.writeAttribute("id", 1);
    expect(c.toParam()).toBe("1");
  });

  it("to param class method", async () => {
    class Firm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
        this.toParam("name");
      }
    }
    const firm = await Firm.create({ name: "Flamboyant Software" });
    expect(firm.toParam()).toBe(`${firm.id}-flamboyant-software`);
  });

  it("to param class method truncates words properly", async () => {
    class Firm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
        this.toParam("name");
      }
    }
    const firm = await Firm.create({ name: "Flamboyant Software, Inc." });
    expect(firm.toParam()).toBe(`${firm.id}-flamboyant-software`);
  });

  it("to param class method truncates after parameterize", async () => {
    class Firm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
        this.toParam("name");
      }
    }
    const firm = await Firm.create({ name: "Huey, Dewey, & Louie LLC" });
    expect(firm.toParam()).toBe(`${firm.id}-huey-dewey-louie-llc`);
  });

  it("to param class method truncates after parameterize with hyphens", async () => {
    class Firm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
        this.toParam("name");
      }
    }
    const firm = await Firm.create({ name: "Door-to-Door Wash-n-Fold Service" });
    expect(firm.toParam()).toBe(`${firm.id}-door-to-door-wash-n`);
  });

  it("to param class method truncates", async () => {
    class Firm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
        this.toParam("name");
      }
    }
    const firm = await Firm.create({ name: "a ".repeat(100) });
    expect(firm.toParam()).toBe(`${firm.id}-a-a-a-a-a-a-a-a-a-a`);
  });

  it("to param class method truncates edge case", async () => {
    class Firm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
        this.toParam("name");
      }
    }
    const firm = await Firm.create({ name: "David HeinemeierHansson" });
    expect(firm.toParam()).toBe(`${firm.id}-david`);
  });

  it("to param class method truncates case shown in doc", async () => {
    class Firm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
        this.toParam("name");
      }
    }
    const firm = await Firm.create({ name: "David Heinemeier Hansson" });
    expect(firm.toParam()).toBe(`${firm.id}-david-heinemeier`);
  });

  it("to param class method squishes", async () => {
    class Firm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
        this.toParam("name");
      }
    }
    const firm = await Firm.create({ name: "ab \n".repeat(100) });
    expect(firm.toParam()).toBe(`${firm.id}-ab-ab-ab-ab-ab-ab-ab`);
  });

  it("to param class method multibyte character", async () => {
    class Firm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
        this.toParam("name");
      }
    }
    const firm = await Firm.create({ name: "戦場ヶ原 ひたぎ" });
    expect(firm.toParam()).toBe(`${firm.id}`);
  });

  it("to param class method uses default if blank", async () => {
    class Firm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
        this.toParam("name");
      }
    }
    const firm = await Firm.create({});
    expect(firm.toParam()).toBe(`${firm.id}`);
    firm.writeAttribute("name", " ");
    expect(firm.toParam()).toBe(`${firm.id}`);
  });

  it("to param class method uses default if not persisted", () => {
    class Firm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
        this.toParam("name");
      }
    }
    const firm = new Firm();
    firm.writeAttribute("name", "Fancy Shirts");
    expect(firm.toParam()).toBeNull();
  });

  it("to param with no arguments", () => {
    class Firm extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = createTestAdapter();
      }
    }
    expect(Firm.toParam()).toBe("Firm");
  });

  it("to param for a composite primary key model", () => {
    class Order extends Base {
      static {
        this.primaryKey = ["shop_id", "id"];
        this.adapter = createTestAdapter();
      }
    }
    const order = new Order();
    order.writeAttribute("shop_id", 1);
    order.writeAttribute("id", 123);
    (order as any)._newRecord = false;
    expect(order.toParam()).toBe("1_123");
  });

  it("param delimiter changes delimiter used in to param", () => {
    class Order extends Base {
      static {
        this.primaryKey = ["shop_id", "id"];
        this.adapter = createTestAdapter();
      }
    }
    const original = Order.paramDelimiter;
    Order.paramDelimiter = ",";
    try {
      const order = new Order();
      order.writeAttribute("shop_id", 1);
      order.writeAttribute("id", 123);
      (order as any)._newRecord = false;
      expect(order.toParam()).toBe("1,123");
    } finally {
      Order.paramDelimiter = original;
    }
  });

  it("param delimiter is defined per class", () => {
    class Order extends Base {
      static {
        this.primaryKey = ["shop_id", "id"];
        this.adapter = createTestAdapter();
        this.paramDelimiter = ",";
      }
    }
    class Book extends Base {
      static {
        this.primaryKey = ["shop_id", "id"];
        this.adapter = createTestAdapter();
        this.paramDelimiter = ";";
      }
    }
    const o = new Order();
    o.writeAttribute("shop_id", 1);
    o.writeAttribute("id", 123);
    (o as any)._newRecord = false;
    const b = new Book();
    b.writeAttribute("shop_id", 1);
    b.writeAttribute("id", 123);
    (b as any)._newRecord = false;
    expect(o.toParam()).toBe("1,123");
    expect(b.toParam()).toBe("1;123");
  });

  it("cache key for existing record is not timezone dependent", async () => {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = createTestAdapter();
      }
    }
    const t = new Date("2024-01-15T10:00:00.000Z");
    const dev = await Developer.create({ name: "Dev" });
    dev.writeAttribute("updated_at", t);
    const key = dev.cacheKey();
    expect(key).toBe(`developers/${dev.id}-${expectedUsec(t)}`);
    expect(key).toBe(dev.cacheKey());
  });

  it("cache key format for existing record with updated at", async () => {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = createTestAdapter();
      }
    }
    const updatedAt = new Date("2024-01-15T10:46:00.123Z");
    const dev = await Developer.create({ name: "Dev" });
    dev.writeAttribute("updated_at", updatedAt);
    expect(dev.cacheKey()).toBe(`developers/${dev.id}-${expectedUsec(updatedAt)}`);
  });

  it("cache key format for existing record with updated at and custom cache timestamp format", async () => {
    class CachedDeveloper extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = createTestAdapter();
        this.cacheTimestampFormat = "number";
      }
    }
    const updatedAt = new Date("2024-01-15T10:46:00Z");
    const dev = await CachedDeveloper.create({ name: "Dev" });
    dev.writeAttribute("updated_at", updatedAt);
    expect(dev.cacheKey()).toBe(`cached_developers/${dev.id}-20240115104600`);
  });

  it("cache key changes when child touched", async () => {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = createTestAdapter();
      }
    }
    const t1 = new Date("2024-01-15T10:00:00.000Z");
    const dev = await Developer.create({ name: "Dev" });
    dev.writeAttribute("updated_at", t1);
    const key1 = dev.cacheKey();
    dev.writeAttribute("updated_at", new Date("2024-01-15T10:00:01.000Z"));
    expect(dev.cacheKey()).not.toBe(key1);
  });

  it("cache key format for existing record with nil updated timestamps", async () => {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.attribute("updated_on", "datetime");
        this.adapter = createTestAdapter();
      }
    }
    const dev = await Developer.create({ name: "Dev" });
    dev.writeAttribute("updated_at", null);
    dev.writeAttribute("updated_on", null);
    expect(dev.cacheKey()).toBe(`developers/${dev.id}`);
  });

  it("cache key for updated on", async () => {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_on", "datetime");
        this.adapter = createTestAdapter();
      }
    }
    const updatedOn = new Date("2024-03-20T08:00:00.456Z");
    const dev = await Developer.create({ name: "Dev" });
    dev.writeAttribute("updated_on", updatedOn);
    expect(dev.cacheKey()).toBe(`developers/${dev.id}-${expectedUsec(updatedOn)}`);
  });

  it("cache key for newer updated at", async () => {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.attribute("updated_on", "datetime");
        this.adapter = createTestAdapter();
      }
    }
    const t1 = new Date("2024-01-15T10:00:00.000Z");
    const t2 = new Date("2024-01-15T11:00:00.000Z");
    const dev = await Developer.create({ name: "Dev" });
    dev.writeAttribute("updated_at", t2);
    dev.writeAttribute("updated_on", t1);
    expect(dev.cacheKey()).toBe(`developers/${dev.id}-${expectedUsec(t2)}`);
  });

  it("cache key for newer updated on", async () => {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.attribute("updated_on", "datetime");
        this.adapter = createTestAdapter();
      }
    }
    const t1 = new Date("2024-01-15T10:00:00.000Z");
    const t2 = new Date("2024-01-15T11:00:00.000Z");
    const dev = await Developer.create({ name: "Dev" });
    dev.writeAttribute("updated_at", t1);
    dev.writeAttribute("updated_on", t2);
    expect(dev.cacheKey()).toBe(`developers/${dev.id}-${expectedUsec(t2)}`);
  });

  it("cache key format is precise enough", async () => {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = createTestAdapter();
      }
    }
    const t1 = new Date("2024-01-15T10:00:00.000Z");
    const dev = await Developer.create({ name: "Dev" });
    dev.writeAttribute("updated_at", t1);
    const key1 = dev.cacheKey();
    dev.writeAttribute("updated_at", new Date(t1.getTime() + 1));
    expect(dev.cacheKey()).not.toBe(key1);
  });

  it("cache key format is not too precise", async () => {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = createTestAdapter();
      }
    }
    const t = new Date("2024-01-15T10:00:00.123Z");
    const dev = await Developer.create({ name: "Dev" });
    dev.writeAttribute("updated_at", t);
    expect(dev.cacheKey()).toBe(dev.cacheKey());
  });

  it("cache version format is precise enough", async () => {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = createTestAdapter();
      }
    }
    const t1 = new Date("2024-01-15T10:00:00.000Z");
    const dev = await Developer.create({ name: "Dev" });
    withCacheVersioning(Developer, () => {
      dev.writeAttribute("updated_at", t1);
      const v1 = dev.cacheVersion();
      dev.writeAttribute("updated_at", new Date(t1.getTime() + 1));
      expect(dev.cacheVersion()).not.toBe(v1);
    });
  });

  it("cache version format is not too precise", async () => {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = createTestAdapter();
      }
    }
    const t = new Date("2024-01-15T10:00:00.123Z");
    const dev = await Developer.create({ name: "Dev" });
    withCacheVersioning(Developer, () => {
      dev.writeAttribute("updated_at", t);
      expect(dev.cacheVersion()).toBe(dev.cacheVersion());
    });
  });

  it("cache key is stable with versioning on", async () => {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = createTestAdapter();
      }
    }
    const t1 = new Date("2024-01-15T10:00:00.000Z");
    const dev = await Developer.create({ name: "Dev" });
    withCacheVersioning(Developer, () => {
      dev.writeAttribute("updated_at", t1);
      const key1 = dev.cacheKey();
      dev.writeAttribute("updated_at", new Date(t1.getTime() + 10000));
      expect(dev.cacheKey()).toBe(key1);
    });
  });

  it("cache version changes with versioning on", async () => {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = createTestAdapter();
      }
    }
    const t1 = new Date("2024-01-15T10:00:00.000Z");
    const dev = await Developer.create({ name: "Dev" });
    withCacheVersioning(Developer, () => {
      dev.writeAttribute("updated_at", t1);
      const v1 = dev.cacheVersion();
      dev.writeAttribute("updated_at", new Date(t1.getTime() + 10000));
      expect(dev.cacheVersion()).not.toBe(v1);
    });
  });

  it("cache key retains version when custom timestamp is used", async () => {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = createTestAdapter();
      }
    }
    const t1 = new Date("2024-01-15T10:00:00.000Z");
    const dev = await Developer.create({ name: "Dev" });
    withCacheVersioning(Developer, () => {
      dev.writeAttribute("updated_at", t1);
      const kv1 = dev.cacheKeyWithVersion();
      dev.writeAttribute("updated_at", new Date(t1.getTime() + 10000));
      expect(dev.cacheKeyWithVersion()).not.toBe(kv1);
    });
  });
});
