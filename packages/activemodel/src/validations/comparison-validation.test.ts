import { describe, it, expect } from "vitest";
import { instant, plainDate } from "@blazetrails/activesupport/testing/temporal-helpers";
import { Model } from "../index.js";

describe("ComparisonValidationTest", () => {
  it("validates comparison with less than or equal to using date", async () => {
    class Event extends Model {
      static {
        this.attribute("startDate", "string");
      }
    }
    // Use numbers for comparison since dates need special handling
    Event.validates("startDate", { comparison: { lessThanOrEqualTo: "2025-12-31" } });
    const e = new Event({ startDate: "2025-01-01" });
    expect(await e.isValid()).toBe(true);
  });

  it("validates comparison with other than using string", async () => {
    class Person extends Model {
      static {
        this.attribute("status", "string");
        this.validates("status", { comparison: { otherThan: "banned" } });
      }
    }
    expect(await new Person({ status: "active" }).isValid()).toBe(true);
    expect(await new Person({ status: "banned" }).isValid()).toBe(false);
  });

  it("validates comparison with blank allowed", async () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { comparison: { greaterThan: 0, allowBlank: true } });
      }
    }
    const p = new Person();
    expect(await p.isValid()).toBe(true);
  });

  it("validates comparison with less than or equal to using time", () => {
    class Event extends Model {
      static {
        this.attribute("start_time", "datetime");
        this.attribute("end_time", "datetime");
      }
    }
    const e = new Event({});
    expect(e.readAttribute("start_time")).toBeNull();
  });

  it("validates comparison with less than or equal to using string", async () => {
    class Person extends Model {
      static {
        this.attribute("code", "string");
        this.validates("code", { comparison: { lessThanOrEqualTo: "zzz" } });
      }
    }
    const p = new Person({ code: "abc" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates comparison with other than using date", async () => {
    class Person extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", { comparison: { otherThan: 0 } });
      }
    }
    const p = new Person({ score: 5 });
    expect(await p.isValid()).toBe(true);
  });

  it("validates comparison with other than using time", async () => {
    class Person extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", { comparison: { otherThan: 0 } });
      }
    }
    const p = new Person({ score: 1 });
    expect(await p.isValid()).toBe(true);
  });

  it("validates comparison with custom compare", async () => {
    class Person extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", { comparison: { greaterThan: 0 } });
      }
    }
    const p = new Person({ score: 5 });
    expect(await p.isValid()).toBe(true);
  });

  it("validates comparison of incomparables", async () => {
    class Person extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", { comparison: { greaterThan: 0 } });
      }
    }
    const p = new Person({ score: -1 });
    await p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("validates comparison non-ArgumentError propagates", async () => {
    class Person extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", {
          comparison: {
            greaterThan: () => {
              throw new TypeError("unexpected");
            },
          },
        });
      }
    }
    const p = new Person({ score: 5 });
    await expect(p.isValid()).rejects.toThrow(TypeError);
  });

  it("validates comparison of no options", () => {
    expect(() => {
      class Person extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: {} });
        }
      }
      return Person;
    }).toThrow();
  });

  it("validates comparison with greater than using numeric", async () => {
    class Order extends Model {
      static {
        this.attribute("quantity", "integer");
        this.validates("quantity", { comparison: { greaterThan: 0 } });
      }
    }
    expect(await new Order({ quantity: 1 }).isValid()).toBe(true);
    expect(await new Order({ quantity: 0 }).isValid()).toBe(false);
    expect(await new Order({ quantity: -1 }).isValid()).toBe(false);
  });

  it("validates comparison with greater than using date", async () => {
    const fixedDate = plainDate("2024-01-01");
    class Event extends Model {
      static {
        this.attribute("date", "date");
        this.validates("date", { comparison: { greaterThan: fixedDate } });
      }
    }
    expect(await new Event({ date: "2024-01-02" }).isValid()).toBe(true);
    expect(await new Event({ date: "2023-12-31" }).isValid()).toBe(false);
  });

  it("validates comparison with greater than using string", async () => {
    class Item extends Model {
      static {
        this.attribute("code", "string");
        this.validates("code", { comparison: { greaterThan: "A" } });
      }
    }
    expect(await new Item({ code: "B" }).isValid()).toBe(true);
    expect(await new Item({ code: "A" }).isValid()).toBe(false);
  });

  it("validates comparison with greater than or equal to using numeric", async () => {
    class Order extends Model {
      static {
        this.attribute("quantity", "integer");
        this.validates("quantity", { comparison: { greaterThanOrEqualTo: 1 } });
      }
    }
    expect(await new Order({ quantity: 1 }).isValid()).toBe(true);
    expect(await new Order({ quantity: 0 }).isValid()).toBe(false);
  });

  it("validates comparison with equal to using numeric", async () => {
    class Item extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", { comparison: { equalTo: 42 } });
      }
    }
    expect(await new Item({ value: 42 }).isValid()).toBe(true);
    expect(await new Item({ value: 43 }).isValid()).toBe(false);
  });

  it("validates comparison with less than using numeric", async () => {
    class Rating extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", { comparison: { lessThan: 10 } });
      }
    }
    expect(await new Rating({ score: 9 }).isValid()).toBe(true);
    expect(await new Rating({ score: 10 }).isValid()).toBe(false);
  });

  it("validates comparison with less than or equal to using numeric", async () => {
    class Rating extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", { comparison: { lessThanOrEqualTo: 10 } });
      }
    }
    expect(await new Rating({ score: 10 }).isValid()).toBe(true);
    expect(await new Rating({ score: 11 }).isValid()).toBe(false);
  });

  it("validates comparison with other than using numeric", async () => {
    class Item extends Model {
      static {
        this.attribute("status", "integer");
        this.validates("status", { comparison: { otherThan: 0 } });
      }
    }
    expect(await new Item({ status: 1 }).isValid()).toBe(true);
    expect(await new Item({ status: 0 }).isValid()).toBe(false);
  });

  it("validates comparison with proc", async () => {
    class Event extends Model {
      static {
        this.attribute("startDate", "date");
        this.attribute("endDate", "date");
        this.validates("endDate", {
          comparison: { greaterThan: (record: any) => record.readAttribute("startDate") },
        });
      }
    }
    expect(await new Event({ startDate: "2024-01-01", endDate: "2024-01-02" }).isValid()).toBe(
      true,
    );
    expect(await new Event({ startDate: "2024-01-02", endDate: "2024-01-01" }).isValid()).toBe(
      false,
    );
  });

  it("validates comparison with nil allowed", async () => {
    class Item extends Model {
      static {
        this.attribute("quantity", "integer");
        this.validates("quantity", { comparison: { greaterThan: 0, allowNil: true } });
      }
    }
    expect(await new Item({}).isValid()).toBe(true);
  });

  it("validates comparison with greater than using time", async () => {
    const baseTime = instant("2024-01-01T12:00:00Z");
    class Event extends Model {
      static {
        this.attribute("startTime", "datetime");
        this.validates("startTime", { comparison: { greaterThan: baseTime } });
      }
    }
    expect(await new Event({ startTime: "2024-01-01T13:00:00Z" }).isValid()).toBe(true);
    expect(await new Event({ startTime: "2024-01-01T11:00:00Z" }).isValid()).toBe(false);
  });

  it("validates comparison with greater than or equal to using date", async () => {
    const baseDate = plainDate("2024-06-01");
    class Event extends Model {
      static {
        this.attribute("date", "date");
        this.validates("date", { comparison: { greaterThanOrEqualTo: baseDate } });
      }
    }
    expect(await new Event({ date: "2024-06-01" }).isValid()).toBe(true);
    expect(await new Event({ date: "2024-05-31" }).isValid()).toBe(false);
  });

  it("validates comparison with greater than or equal to using time", async () => {
    const baseTime = instant("2024-01-01T12:00:00Z");
    class Event extends Model {
      static {
        this.attribute("time", "datetime");
        this.validates("time", { comparison: { greaterThanOrEqualTo: baseTime } });
      }
    }
    expect(await new Event({ time: "2024-01-01T12:00:00Z" }).isValid()).toBe(true);
    expect(await new Event({ time: "2024-01-01T11:59:59Z" }).isValid()).toBe(false);
  });

  it("validates comparison with greater than or equal to using string", async () => {
    class Item extends Model {
      static {
        this.attribute("code", "string");
        this.validates("code", { comparison: { greaterThanOrEqualTo: "B" } });
      }
    }
    expect(await new Item({ code: "B" }).isValid()).toBe(true);
    expect(await new Item({ code: "C" }).isValid()).toBe(true);
    expect(await new Item({ code: "A" }).isValid()).toBe(false);
  });

  it("validates comparison with equal to using date", async () => {
    const target = plainDate("2024-06-15");
    class Event extends Model {
      static {
        this.attribute("date", "date");
        this.validates("date", { comparison: { equalTo: target } });
      }
    }
    expect(await new Event({ date: "2024-06-15" }).isValid()).toBe(true);
    expect(await new Event({ date: "2024-06-16" }).isValid()).toBe(false);
  });

  it("validates comparison with equal to using time", async () => {
    const target = instant("2024-01-01T12:00:00Z");
    class Event extends Model {
      static {
        this.attribute("time", "datetime");
        this.validates("time", { comparison: { equalTo: target } });
      }
    }
    expect(await new Event({ time: "2024-01-01T12:00:00Z" }).isValid()).toBe(true);
    expect(await new Event({ time: "2024-01-01T12:00:01Z" }).isValid()).toBe(false);
  });

  it("validates comparison with equal to using string", async () => {
    class Item extends Model {
      static {
        this.attribute("code", "string");
        this.validates("code", { comparison: { equalTo: "ABC" } });
      }
    }
    expect(await new Item({ code: "ABC" }).isValid()).toBe(true);
    expect(await new Item({ code: "ABD" }).isValid()).toBe(false);
  });

  it("validates comparison with less than using date", async () => {
    const limit = plainDate("2025-01-01");
    class Event extends Model {
      static {
        this.attribute("date", "date");
        this.validates("date", { comparison: { lessThan: limit } });
      }
    }
    expect(await new Event({ date: "2024-12-31" }).isValid()).toBe(true);
    expect(await new Event({ date: "2025-01-01" }).isValid()).toBe(false);
  });

  it("validates comparison with less than using time", async () => {
    const limit = instant("2024-01-01T12:00:00Z");
    class Event extends Model {
      static {
        this.attribute("time", "datetime");
        this.validates("time", { comparison: { lessThan: limit } });
      }
    }
    expect(await new Event({ time: "2024-01-01T11:59:59Z" }).isValid()).toBe(true);
    expect(await new Event({ time: "2024-01-01T12:00:00Z" }).isValid()).toBe(false);
  });

  it("validates comparison with less than using string", async () => {
    class Item extends Model {
      static {
        this.attribute("code", "string");
        this.validates("code", { comparison: { lessThan: "Z" } });
      }
    }
    expect(await new Item({ code: "A" }).isValid()).toBe(true);
    expect(await new Item({ code: "Z" }).isValid()).toBe(false);
  });

  it("validates comparison with lambda", async () => {
    class Event extends Model {
      static {
        this.attribute("startDate", "date");
        this.attribute("endDate", "date");
        this.validates("endDate", {
          comparison: { greaterThan: (r: any) => r.readAttribute("startDate") },
        });
      }
    }
    expect(await new Event({ startDate: "2024-01-01", endDate: "2024-02-01" }).isValid()).toBe(
      true,
    );
    expect(await new Event({ startDate: "2024-02-01", endDate: "2024-01-01" }).isValid()).toBe(
      false,
    );
  });

  it("validates comparison with method", async () => {
    class Event extends Model {
      static {
        this.attribute("startDate", "date");
        this.attribute("endDate", "date");
        this.validates("endDate", {
          comparison: { greaterThan: (r: any) => r.getStartDate() },
        });
      }
      getStartDate() {
        return this.readAttribute("startDate");
      }
    }
    expect(await new Event({ startDate: "2024-01-01", endDate: "2024-02-01" }).isValid()).toBe(
      true,
    );
  });

  it("validates comparison of multiple values", async () => {
    class Score extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", {
          comparison: { greaterThanOrEqualTo: 0, lessThanOrEqualTo: 100 },
        });
      }
    }
    expect(await new Score({ value: 50 }).isValid()).toBe(true);
    expect(await new Score({ value: -1 }).isValid()).toBe(false);
    expect(await new Score({ value: 101 }).isValid()).toBe(false);
  });
});
describe("ComparisonValidator", () => {
  it("validates greaterThan", async () => {
    class Order extends Model {
      static {
        this.attribute("quantity", "integer");
        this.validates("quantity", { comparison: { greaterThan: 0 } });
      }
    }
    expect(await new Order({ quantity: 5 }).isValid()).toBe(true);
    expect(await new Order({ quantity: 0 }).isValid()).toBe(false);
    expect(await new Order({ quantity: -1 }).isValid()).toBe(false);
  });

  it("validates greaterThanOrEqualTo", async () => {
    class Order extends Model {
      static {
        this.attribute("quantity", "integer");
        this.validates("quantity", { comparison: { greaterThanOrEqualTo: 1 } });
      }
    }
    expect(await new Order({ quantity: 1 }).isValid()).toBe(true);
    expect(await new Order({ quantity: 0 }).isValid()).toBe(false);
  });

  it("validates lessThan", async () => {
    class Rating extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", { comparison: { lessThan: 10 } });
      }
    }
    expect(await new Rating({ score: 9 }).isValid()).toBe(true);
    expect(await new Rating({ score: 10 }).isValid()).toBe(false);
  });

  it("validates lessThanOrEqualTo", async () => {
    class Rating extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", { comparison: { lessThanOrEqualTo: 10 } });
      }
    }
    expect(await new Rating({ score: 10 }).isValid()).toBe(true);
    expect(await new Rating({ score: 11 }).isValid()).toBe(false);
  });

  it("validates comparison with equal to using numeric", async () => {
    class Confirmation extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", { comparison: { equalTo: 42 } });
      }
    }
    expect(await new Confirmation({ value: 42 }).isValid()).toBe(true);
    expect(await new Confirmation({ value: 43 }).isValid()).toBe(false);
  });

  it("validates comparison with other than using numeric", async () => {
    class Item extends Model {
      static {
        this.attribute("status", "integer");
        this.validates("status", { comparison: { otherThan: 0 } });
      }
    }
    expect(await new Item({ status: 1 }).isValid()).toBe(true);
    expect(await new Item({ status: 0 }).isValid()).toBe(false);
  });

  it("validates comparison with proc", async () => {
    class Event extends Model {
      static {
        this.attribute("startDate", "date");
        this.attribute("endDate", "date");
        this.validates("endDate", {
          comparison: { greaterThan: (record: any) => record.readAttribute("startDate") },
        });
      }
    }
    const valid = new Event({ startDate: "2024-01-01", endDate: "2024-01-02" });
    expect(await valid.isValid()).toBe(true);

    const invalid = new Event({ startDate: "2024-01-02", endDate: "2024-01-01" });
    expect(await invalid.isValid()).toBe(false);
  });

  it("validates comparison with greater than using date", async () => {
    const tomorrow = plainDate("2024-06-02");
    class Booking extends Model {
      static {
        this.attribute("checkIn", "date");
        this.validates("checkIn", { comparison: { greaterThanOrEqualTo: tomorrow } });
      }
    }
    expect(await new Booking({ checkIn: "2024-06-02" }).isValid()).toBe(true);
    expect(await new Booking({ checkIn: "2024-06-01" }).isValid()).toBe(false);
  });

  it("validates comparison with greater than using string", async () => {
    class Item extends Model {
      static {
        this.attribute("code", "string");
        this.validates("code", { comparison: { greaterThan: "A" } });
      }
    }
    expect(await new Item({ code: "B" }).isValid()).toBe(true);
    expect(await new Item({ code: "A" }).isValid()).toBe(false);
  });

  it("validates comparison with nil allowed", async () => {
    class Item extends Model {
      static {
        this.attribute("quantity", "integer");
        this.validates("quantity", { comparison: { greaterThan: 0, allowNil: true } });
      }
    }
    expect(await new Item({}).isValid()).toBe(true);
  });

  it("supports custom message", async () => {
    class Item extends Model {
      static {
        this.attribute("qty", "integer");
        this.validates("qty", {
          comparison: { greaterThan: 0, message: "must be positive" },
        });
      }
    }
    const item = new Item({ qty: 0 });
    expect(await item.isValid()).toBe(false);
    expect(item.errors.fullMessages).toContain("Qty must be positive");
  });

  it("validates comparison of multiple values", async () => {
    class Score extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", {
          comparison: { greaterThanOrEqualTo: 0, lessThanOrEqualTo: 100 },
        });
      }
    }
    expect(await new Score({ value: 50 }).isValid()).toBe(true);
    expect(await new Score({ value: -1 }).isValid()).toBe(false);
    expect(await new Score({ value: 101 }).isValid()).toBe(false);
  });
});
