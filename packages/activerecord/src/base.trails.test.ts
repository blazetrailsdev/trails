/**
 * Trails-specific invariants split out of base.test.ts (RFC 0043).
 *
 * These guard trails-internal behavior with no Rails counterpart in
 * base_test.rb: the quoteSqlValue SQL-literal helper, the _applyScopeAttributes
 * scoping mechanism, the UnknownPrimaryKey error message, and the schemaCache-less
 * tableExists fallback.
 */
import { describe, it, expect } from "vitest";
import { Base, UnknownPrimaryKey } from "./index.js";
import { quoteSqlValue } from "./base.js";
import { Temporal } from "@blazetrails/activesupport/temporal";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";

describe("quoteSqlValue", () => {
  it("emits bare decimal for bigint (not quoted string)", () => {
    expect(quoteSqlValue(123n)).toBe("123");
    expect(quoteSqlValue(2n ** 62n)).toBe("4611686018427387904");
    expect(quoteSqlValue(-1n)).toBe("-1");
  });

  it("emits bare decimal for number (unchanged)", () => {
    expect(quoteSqlValue(42)).toBe("42");
    expect(quoteSqlValue(-7)).toBe("-7");
  });

  it("emits NULL for null/undefined", () => {
    expect(quoteSqlValue(null)).toBe("NULL");
    expect(quoteSqlValue(undefined)).toBe("NULL");
  });

  it("emits ISO-quoted literal for a valid Date", () => {
    expect(quoteSqlValue(new Date("2026-04-15T12:00:00.000Z"))).toBe("'2026-04-15T12:00:00.000Z'");
  });

  it("emits NULL for an invalid Date (NaN)", () => {
    expect(quoteSqlValue(new Date(NaN))).toBe("NULL");
  });

  it("emits NULL for object whose toJSON() returns undefined (no crash)", () => {
    const v = { toJSON: () => undefined };
    expect(() => quoteSqlValue(v)).not.toThrow();
    expect(quoteSqlValue(v)).toBe("NULL");
  });

  it("serializes object containing bigint values without crashing", () => {
    expect(() => quoteSqlValue({ a: 1n })).not.toThrow();
    expect(quoteSqlValue({ a: 1n })).toBe('\'{"a":"1"}\'');
  });

  it("emits NULL for circular object (no crash)", () => {
    const circ: Record<string, unknown> = {};
    circ.self = circ;
    expect(() => quoteSqlValue(circ)).not.toThrow();
    expect(quoteSqlValue(circ)).toBe("NULL");
  });

  it("quotes a Temporal.Instant as a SQL datetime literal", () => {
    // value_for_database yields the cast Temporal; the inline insert_all VALUES
    // path renders the dialect-correct literal. Default (no dialect) uses the
    // trimmed abstract formatter.
    expect(quoteSqlValue(Temporal.Instant.from("2026-04-26T14:23:55Z"))).toBe(
      "'2026-04-26 14:23:55'",
    );
  });

  it("renders the PG BC literal for a proleptic-year Instant (insert_all VALUES)", () => {
    // Regression guard: the PG inline VALUES path must carry the " BC" suffix
    // and fixed-6 microseconds, matching the adapter's quoted_date.
    const instant = Temporal.Instant.from("-000043-03-15T12:34:56.123456Z");
    expect(quoteSqlValue(instant, false, "postgres")).toBe("'0044-03-15 12:34:56.123456 BC'");
  });

  it("caps PG datetime literal fractional seconds at microseconds", () => {
    const instant = Temporal.Instant.from("2026-04-26T14:23:55.123456789Z");
    expect(quoteSqlValue(instant, false, "postgres")).toBe("'2026-04-26 14:23:55.123456'");
  });
});

describe("_applyScopeAttributes — scoping initializeInternalsCallback", () => {
  function makeModel() {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("role", "string");
        this.attribute("status", "string");
      }
    }
    return User;
  }

  it("applies current-scope attributes to new instances", async () => {
    const User = makeModel();
    const rel = User.where({ role: "admin" });
    await User.scoping(rel, async () => {
      const u = new User({});
      expect(u.readAttribute("role")).toBe("admin");
    });
  });

  it("explicit constructor attrs take precedence over scope attrs", async () => {
    const User = makeModel();
    const rel = User.where({ role: "admin" });
    await User.scoping(rel, async () => {
      const u = new User({ role: "guest" });
      expect(u.readAttribute("role")).toBe("guest");
    });
  });

  it("scope attrs fill in keys not provided explicitly", async () => {
    const User = makeModel();
    const rel = User.where({ role: "admin", status: "active" });
    await User.scoping(rel, async () => {
      const u = new User({ role: "guest" }); // only role is explicit
      expect(u.readAttribute("role")).toBe("guest"); // explicit wins
      expect(u.readAttribute("status")).toBe("active"); // scope fills in
    });
  });

  it("no scope → no change to constructor attrs", async () => {
    const User = makeModel();
    const u = new User({ role: "user" });
    expect(u.readAttribute("role")).toBe("user");
  });
});

describe("_applyScopeAttributes — multiparameter path", () => {
  it("scope attrs applied in multiparameter constructor path", async () => {
    class Event extends Base {
      static {
        this._tableName = "events";
        this.attribute("id", "integer");
        this.attribute("role", "string");
        this.attribute("starts_on", "date");
      }
    }
    const rel = Event.where({ role: "organizer" });
    await Event.scoping(rel, async () => {
      // Use multiparameter date keys — triggers the multiparameter constructor path
      const e = new Event({ "starts_on(1i)": "2024", "starts_on(2i)": "6", "starts_on(3i)": "15" });
      // Scope attr should be applied (role was not in the explicit multiparams)
      expect(e.readAttribute("role")).toBe("organizer");
    });
  });

  it("explicit multiparameter attrs take precedence over scope attrs with same key", async () => {
    class Event extends Base {
      static {
        this._tableName = "events";
        this.attribute("id", "integer");
        this.attribute("role", "string");
        this.attribute("starts_on", "date");
      }
    }
    const rel = Event.where({ role: "organizer" });
    await Event.scoping(rel, async () => {
      // role is provided explicitly (non-multiparameter key alongside multiparameter keys)
      const e = new Event({
        "starts_on(1i)": "2024",
        "starts_on(2i)": "6",
        "starts_on(3i)": "15",
        role: "guest",
      });
      expect(e.readAttribute("role")).toBe("guest"); // explicit wins
    });
  });
});

describe("_applyScopeAttributes — STI type column wins over scope", () => {
  it("STI type column is not overwritten by a scope that sets type", async () => {
    class Vehicle extends Base {
      static {
        this._tableName = "vehicles";
        this.attribute("id", "integer");
        this.attribute("type", "string");
      }
    }
    const { enableSti } = await import("./inheritance.js");
    enableSti(Vehicle);
    class Car extends Vehicle {}

    // Scope includes type: "Vehicle" — but new Car() should still have type: "Car"
    const rel = Vehicle.where({ type: "Vehicle" });
    await Vehicle.scoping(rel, async () => {
      const car = new Car({});
      expect(car.readAttribute("type")).toBe("Car");
    });
  });
});

describe("UnknownPrimaryKeyTest", () => {
  it("no-arg constructor produces generic message", () => {
    const err = new UnknownPrimaryKey();
    expect(err.message).toBe("Unknown primary key.");
    expect(err.model).toBeNull();
  });

  it("description is separated by newline+space", () => {
    class Dummy extends Base {}
    const err = new UnknownPrimaryKey(Dummy, "No PK configured.");
    expect(err.message).toBe(
      "Unknown primary key for table dummies in model Dummy.\nNo PK configured.",
    );
    expect(err.model).toBe(Dummy);
  });
});

describe("BasicsTest (trails)", () => {
  it("tableExists returns true when adapter has no schemaCache", async () => {
    class Ghost extends Base {
      static tableName = "ghosts_that_do_not_exist";
      static {
        this.attribute("name", "string");
        this.adapter = { adapterName: "sqlite" } as DatabaseAdapter;
      }
    }
    const exists = await Ghost.tableExists();
    expect(exists).toBe(true);
  });
});
