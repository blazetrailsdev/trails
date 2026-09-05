import { Time as RubyTime } from "@blazetrails/date";
import { describe, it, expect } from "vitest";
import { Rational } from "@blazetrails/ruby-compat";
import { CachedDeveloper, Developer } from "./test-helpers/models/developer.js";
import { Client, Firm } from "./test-helpers/models/company.js";
import { Owner } from "./test-helpers/models/owner.js";
import { Pet } from "./test-helpers/models/pet.js";
import { CpkBook, CpkOrder } from "./test-helpers/models/cpk.js";
import { registerModel } from "./associations.js";
import { fixtures } from "./test-fixtures.js";
import { withTimezoneConfig } from "./test-helper.js";

registerModel(Owner);
registerModel(Pet);

function toFs(ts: unknown, fmt: "usec" | "number"): string {
  if (!(ts instanceof RubyTime)) throw new Error("expected a Time");
  const dt = ts.getutc().toTime();
  const y = dt.year.toString().padStart(4, "0");
  const mo = dt.month.toString().padStart(2, "0");
  const day = dt.day.toString().padStart(2, "0");
  const h = dt.hour.toString().padStart(2, "0");
  const mi = dt.minute.toString().padStart(2, "0");
  const s = dt.second.toString().padStart(2, "0");
  const head = `${y}${mo}${day}${h}${mi}${s}`;
  if (fmt === "number") return head;
  const us = (dt.millisecond * 1000 + dt.microsecond).toString().padStart(6, "0");
  return `${head}${us}`;
}

async function withCacheVersioning(fn: () => Promise<void> | void): Promise<void> {
  const original = Developer.cacheVersioning;
  Developer.cacheVersioning = true;
  try {
    await fn();
  } finally {
    Developer.cacheVersioning = original;
  }
}

describe("IntegrationTest", () => {
  const { owners, pets } = fixtures(["companies", "developers", "owners", "pets"]);

  it("to param should return string", async () => {
    expect(Object((await Client.first())!.toParam())).toBeInstanceOf(String);
  });

  it("to param returns nil if not persisted", () => {
    const client = new Client();
    expect(client.toParam()).toBeNull();
  });

  it("to param returns id if not persisted but id is set", () => {
    const client = new Client();
    client.writeAttribute("id", 1);
    expect(client.toParam()).toBe("1");
  });

  it("to param class method", async () => {
    const firm = await Firm.find(4);
    expect(firm.toParam()).toBe("4-flamboyant-software");
  });

  it("to param class method truncates words properly", async () => {
    const firm = await Firm.find(4);
    firm.name = (firm.readAttribute("name") as string) + ", Inc.";
    expect(firm.toParam()).toBe("4-flamboyant-software");
  });

  it("to param class method truncates after parameterize", async () => {
    const firm = await Firm.find(4);
    firm.name = "Huey, Dewey, & Louie LLC";
    expect(firm.toParam()).toBe("4-huey-dewey-louie-llc");
  });

  it("to param class method truncates after parameterize with hyphens", async () => {
    const firm = await Firm.find(4);
    firm.name = "Door-to-Door Wash-n-Fold Service";
    expect(firm.toParam()).toBe("4-door-to-door-wash-n");
  });

  it("to param class method truncates", async () => {
    const firm = await Firm.find(4);
    firm.name = "a ".repeat(100);
    expect(firm.toParam()).toBe("4-a-a-a-a-a-a-a-a-a-a");
  });

  it("to param class method truncates edge case", async () => {
    const firm = await Firm.find(4);
    firm.name = "David HeinemeierHansson";
    expect(firm.toParam()).toBe("4-david");
  });

  it("to param class method truncates case shown in doc", async () => {
    const firm = await Firm.find(4);
    firm.name = "David Heinemeier Hansson";
    expect(firm.toParam()).toBe("4-david-heinemeier");
  });

  it("to param class method squishes", async () => {
    const firm = await Firm.find(4);
    firm.name = "ab \n".repeat(100);
    expect(firm.toParam()).toBe("4-ab-ab-ab-ab-ab-ab-ab");
  });

  it("to param class method multibyte character", async () => {
    const firm = await Firm.find(4);
    firm.name = "戦場ヶ原 ひたぎ";
    expect(firm.toParam()).toBe("4");
  });

  it("to param class method uses default if blank", async () => {
    const firm = await Firm.find(4);
    firm.writeAttribute("name", null);
    expect(firm.toParam()).toBe("4");
    firm.name = " ";
    expect(firm.toParam()).toBe("4");
  });

  it("to param class method uses default if not persisted", () => {
    const firm = new Firm({ name: "Fancy Shirts" });
    expect(firm.toParam()).toBeNull();
  });

  it("to param with no arguments", () => {
    expect(Firm.toParam()).toBe("Firm");
  });

  it("to param for a composite primary key model", () => {
    expect(new CpkOrder({ id: [1, 123] }).toParam()).toBe("1_123");
  });

  it("param delimiter changes delimiter used in to param", () => {
    const original = CpkOrder.paramDelimiter;
    CpkOrder.paramDelimiter = ",";
    try {
      expect(new CpkOrder({ id: [1, 123] }).toParam()).toBe("1,123");
    } finally {
      CpkOrder.paramDelimiter = original;
    }
  });

  it("param delimiter is defined per class", () => {
    const originalOrder = CpkOrder.paramDelimiter;
    const originalBook = CpkBook.paramDelimiter;
    CpkOrder.paramDelimiter = ",";
    CpkBook.paramDelimiter = ";";
    try {
      expect(new CpkOrder({ id: [1, 123] }).toParam()).toBe("1,123");
      expect(new CpkBook({ id: [1, 123] }).toParam()).toBe("1;123");
    } finally {
      CpkOrder.paramDelimiter = originalOrder;
      CpkBook.paramDelimiter = originalBook;
    }
  });

  it("cache key for existing record is not timezone dependent", async () => {
    const utcKey = (await Developer.first())!.cacheKey();
    await withTimezoneConfig({ zone: "America/New_York" }, async () => {
      const estKey = (await Developer.first())!.cacheKey();
      expect(estKey).toBe(utcKey);
    });
  });

  it("cache key format for existing record with updated at", async () => {
    const dev = await Developer.first();
    expect(dev!.cacheKey()).toBe(
      `developers/${dev!.id}-${toFs(dev!.readAttribute("updated_at"), "usec")}`,
    );
  });

  it("cache key format for existing record with updated at and custom cache timestamp format", async () => {
    const dev = await CachedDeveloper.first();
    expect(dev!.cacheKey()).toBe(
      `cached_developers/${dev!.id}-${toFs(dev!.readAttribute("updated_at"), "number")}`,
    );
  });

  it("cache key changes when child touched", async () => {
    const owner = owners("blackbeard");
    const pet = pets("parrot");

    const now = RubyTime.now();
    await owner.updateColumn("updated_at", now);
    const key = owner.cacheKey();

    expect(await pet.touch({ time: now.plus(1) })).toBeTruthy();
    await owner.reload();
    expect(owner.cacheKey()).not.toBe(key);
  });

  it("cache key format for existing record with nil updated timestamps", async () => {
    const dev = await Developer.first();
    await dev!.updateColumns({ updated_at: null, updated_on: null });
    expect(dev!.cacheKey()).toMatch(new RegExp(`/${dev!.id}$`));
  });

  it("cache key for updated on", async () => {
    const dev = await Developer.first();
    dev!.writeAttribute("updated_at", null);
    expect(dev!.cacheKey()).toBe(
      `developers/${dev!.id}-${toFs(dev!.readAttribute("updated_on"), "usec")}`,
    );
  });

  it("cache key for newer updated at", async () => {
    const dev = await Developer.first();
    const updatedAt = (dev!.readAttribute("updated_at") as RubyTime).plus(3600);
    dev!.writeAttribute("updated_at", updatedAt);
    expect(dev!.cacheKey()).toBe(`developers/${dev!.id}-${toFs(updatedAt, "usec")}`);
  });

  it("cache key for newer updated on", async () => {
    const dev = await Developer.first();
    const updatedOn = (dev!.readAttribute("updated_on") as RubyTime).plus(3600);
    dev!.writeAttribute("updated_on", updatedOn);
    expect(dev!.cacheKey()).toBe(`developers/${dev!.id}-${toFs(updatedOn, "usec")}`);
  });

  it("cache key format is precise enough", async () => {
    const dev = await Developer.first();
    const key = dev!.cacheKey();
    await dev!.touch({
      time: (dev!.readAttribute("updated_at") as RubyTime).plus(new Rational(1, 1_000_000)),
    });
    expect(dev!.cacheKey()).not.toBe(key);
  });

  it("cache key format is not too precise", async () => {
    const dev = await Developer.first();
    await dev!.touch();
    const key = dev!.cacheKey();
    await dev!.reload();
    expect(dev!.cacheKey()).toBe(key);
  });

  it("cache version format is precise enough", async () => {
    await withCacheVersioning(async () => {
      const dev = await Developer.first();
      const version = dev!.cacheVersion();
      await dev!.touch({
        time: (dev!.readAttribute("updated_at") as RubyTime).plus(new Rational(1, 1_000_000)),
      });
      expect(dev!.cacheVersion()).not.toBe(version);
    });
  });

  it("cache version format is not too precise", async () => {
    await withCacheVersioning(async () => {
      const dev = await Developer.first();
      await dev!.touch();
      const key = dev!.cacheVersion();
      await dev!.reload();
      expect(dev!.cacheVersion()).toBe(key);
    });
  });

  it("cache key is stable with versioning on", async () => {
    await withCacheVersioning(async () => {
      const developer = await Developer.first();
      const firstKey = developer!.cacheKey();
      await developer!.touch();
      const secondKey = developer!.cacheKey();
      expect(secondKey).toBe(firstKey);
    });
  });

  it("cache version changes with versioning on", async () => {
    await withCacheVersioning(async () => {
      const developer = await Developer.first();
      const firstVersion = developer!.cacheVersion();
      await developer!.touch({
        time: (developer!.readAttribute("updated_at") as RubyTime).plus(10),
      });
      const secondVersion = developer!.cacheVersion();
      expect(secondVersion).not.toBe(firstVersion);
    });
  });

  it("cache key retains version when custom timestamp is used", async () => {
    await withCacheVersioning(async () => {
      const developer = await Developer.first();
      const firstKey = developer!.cacheKeyWithVersion();
      await developer!.touch({
        time: (developer!.readAttribute("updated_at") as RubyTime).plus(10),
      });
      const secondKey = developer!.cacheKeyWithVersion();
      expect(secondKey).not.toBe(firstKey);
    });
  });
});
