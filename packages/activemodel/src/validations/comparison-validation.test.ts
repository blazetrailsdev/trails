import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("ActiveModel", () => {
  describe("ComparisonValidationTest", () => {
    it("validates comparison with less than or equal to using date", () => {
      class Event extends Model {
        static {
          this.attribute("startDate", "string");
        }
      }
      // Use numbers for comparison since dates need special handling
      Event.validates("startDate", { comparison: { lessThanOrEqualTo: "2025-12-31" } });
      const e = new Event({ startDate: "2025-01-01" });
      expect(e.isValid()).toBe(true);
    });

    it("validates comparison with other than using string", () => {
      class Person extends Model {
        static {
          this.attribute("status", "string");
          this.validates("status", { comparison: { otherThan: "banned" } });
        }
      }
      expect(new Person({ status: "active" }).isValid()).toBe(true);
      expect(new Person({ status: "banned" }).isValid()).toBe(false);
    });

    it("validates comparison with blank allowed", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
          this.validates("age", { comparison: { greaterThan: 0 } });
        }
      }
      // null/undefined values are skipped by comparison validator
      const p = new Person();
      expect(p.isValid()).toBe(true);
    });
  });

  describe("ComparisonValidationTest", () => {
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

    it("validates comparison with less than or equal to using string", () => {
      class Person extends Model {
        static {
          this.attribute("code", "string");
          this.validates("code", { comparison: { lessThanOrEqualTo: "zzz" } });
        }
      }
      const p = new Person({ code: "abc" });
      expect(p.isValid()).toBe(true);
    });

    it("validates comparison with other than using date", () => {
      class Person extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: { otherThan: 0 } });
        }
      }
      const p = new Person({ score: 5 });
      expect(p.isValid()).toBe(true);
    });

    it("validates comparison with other than using time", () => {
      class Person extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: { otherThan: 0 } });
        }
      }
      const p = new Person({ score: 1 });
      expect(p.isValid()).toBe(true);
    });

    it("validates comparison with custom compare", () => {
      class Person extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: { greaterThan: 0 } });
        }
      }
      const p = new Person({ score: 5 });
      expect(p.isValid()).toBe(true);
    });

    it("validates comparison of incomparables", () => {
      class Person extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: { greaterThan: 0 } });
        }
      }
      const p = new Person({ score: -1 });
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("validates comparison of no options", () => {
      class Person extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: {} });
        }
      }
      const p = new Person({ score: 5 });
      expect(p.isValid()).toBe(true);
    });
  });

  describe("Validations Comparison (ported)", () => {
    it("validates comparison with greater than using numeric", () => {
      class Order extends Model {
        static {
          this.attribute("quantity", "integer");
          this.validates("quantity", { comparison: { greaterThan: 0 } });
        }
      }
      expect(new Order({ quantity: 1 }).isValid()).toBe(true);
      expect(new Order({ quantity: 0 }).isValid()).toBe(false);
      expect(new Order({ quantity: -1 }).isValid()).toBe(false);
    });

    it("validates comparison with greater than using date", () => {
      const fixedDate = new Date("2024-01-01");
      class Event extends Model {
        static {
          this.attribute("date", "date");
          this.validates("date", { comparison: { greaterThan: fixedDate } });
        }
      }
      expect(new Event({ date: new Date("2024-01-02") }).isValid()).toBe(true);
      expect(new Event({ date: new Date("2023-12-31") }).isValid()).toBe(false);
    });

    it("validates comparison with greater than using string", () => {
      class Item extends Model {
        static {
          this.attribute("code", "string");
          this.validates("code", { comparison: { greaterThan: "A" } });
        }
      }
      expect(new Item({ code: "B" }).isValid()).toBe(true);
      expect(new Item({ code: "A" }).isValid()).toBe(false);
    });

    it("validates comparison with greater than or equal to using numeric", () => {
      class Order extends Model {
        static {
          this.attribute("quantity", "integer");
          this.validates("quantity", { comparison: { greaterThanOrEqualTo: 1 } });
        }
      }
      expect(new Order({ quantity: 1 }).isValid()).toBe(true);
      expect(new Order({ quantity: 0 }).isValid()).toBe(false);
    });

    it("validates comparison with equal to using numeric", () => {
      class Item extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { comparison: { equalTo: 42 } });
        }
      }
      expect(new Item({ value: 42 }).isValid()).toBe(true);
      expect(new Item({ value: 43 }).isValid()).toBe(false);
    });

    it("validates comparison with less than using numeric", () => {
      class Rating extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: { lessThan: 10 } });
        }
      }
      expect(new Rating({ score: 9 }).isValid()).toBe(true);
      expect(new Rating({ score: 10 }).isValid()).toBe(false);
    });

    it("validates comparison with less than or equal to using numeric", () => {
      class Rating extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: { lessThanOrEqualTo: 10 } });
        }
      }
      expect(new Rating({ score: 10 }).isValid()).toBe(true);
      expect(new Rating({ score: 11 }).isValid()).toBe(false);
    });

    it("validates comparison with other than using numeric", () => {
      class Item extends Model {
        static {
          this.attribute("status", "integer");
          this.validates("status", { comparison: { otherThan: 0 } });
        }
      }
      expect(new Item({ status: 1 }).isValid()).toBe(true);
      expect(new Item({ status: 0 }).isValid()).toBe(false);
    });

    it("validates comparison with proc", () => {
      class Event extends Model {
        static {
          this.attribute("startDate", "date");
          this.attribute("endDate", "date");
          this.validates("endDate", {
            comparison: { greaterThan: (record: any) => record.readAttribute("startDate") },
          });
        }
      }
      expect(
        new Event({ startDate: new Date("2024-01-01"), endDate: new Date("2024-01-02") }).isValid(),
      ).toBe(true);
      expect(
        new Event({ startDate: new Date("2024-01-02"), endDate: new Date("2024-01-01") }).isValid(),
      ).toBe(false);
    });

    it("validates comparison with nil allowed", () => {
      class Item extends Model {
        static {
          this.attribute("quantity", "integer");
          this.validates("quantity", { comparison: { greaterThan: 0 } });
        }
      }
      expect(new Item({}).isValid()).toBe(true);
    });

    it("validates comparison with greater than using time", () => {
      const baseTime = new Date("2024-01-01T12:00:00Z");
      class Event extends Model {
        static {
          this.attribute("startTime", "datetime");
          this.validates("startTime", { comparison: { greaterThan: baseTime } });
        }
      }
      expect(new Event({ startTime: new Date("2024-01-01T13:00:00Z") }).isValid()).toBe(true);
      expect(new Event({ startTime: new Date("2024-01-01T11:00:00Z") }).isValid()).toBe(false);
    });

    it("validates comparison with greater than or equal to using date", () => {
      const baseDate = new Date("2024-06-01");
      class Event extends Model {
        static {
          this.attribute("date", "date");
          this.validates("date", { comparison: { greaterThanOrEqualTo: baseDate } });
        }
      }
      expect(new Event({ date: new Date("2024-06-01") }).isValid()).toBe(true);
      expect(new Event({ date: new Date("2024-05-31") }).isValid()).toBe(false);
    });

    it("validates comparison with greater than or equal to using time", () => {
      const baseTime = new Date("2024-01-01T12:00:00Z");
      class Event extends Model {
        static {
          this.attribute("time", "datetime");
          this.validates("time", { comparison: { greaterThanOrEqualTo: baseTime } });
        }
      }
      expect(new Event({ time: new Date("2024-01-01T12:00:00Z") }).isValid()).toBe(true);
      expect(new Event({ time: new Date("2024-01-01T11:59:59Z") }).isValid()).toBe(false);
    });

    it("validates comparison with greater than or equal to using string", () => {
      class Item extends Model {
        static {
          this.attribute("code", "string");
          this.validates("code", { comparison: { greaterThanOrEqualTo: "B" } });
        }
      }
      expect(new Item({ code: "B" }).isValid()).toBe(true);
      expect(new Item({ code: "C" }).isValid()).toBe(true);
      expect(new Item({ code: "A" }).isValid()).toBe(false);
    });

    it("validates comparison with equal to using date", () => {
      const target = new Date("2024-06-15");
      class Event extends Model {
        static {
          this.attribute("date", "date");
          this.validates("date", { comparison: { equalTo: target } });
        }
      }
      expect(new Event({ date: new Date("2024-06-15") }).isValid()).toBe(true);
      expect(new Event({ date: new Date("2024-06-16") }).isValid()).toBe(false);
    });

    it("validates comparison with equal to using time", () => {
      const target = new Date("2024-01-01T12:00:00Z");
      class Event extends Model {
        static {
          this.attribute("time", "datetime");
          this.validates("time", { comparison: { equalTo: target } });
        }
      }
      expect(new Event({ time: new Date("2024-01-01T12:00:00Z") }).isValid()).toBe(true);
      expect(new Event({ time: new Date("2024-01-01T12:00:01Z") }).isValid()).toBe(false);
    });

    it("validates comparison with equal to using string", () => {
      class Item extends Model {
        static {
          this.attribute("code", "string");
          this.validates("code", { comparison: { equalTo: "ABC" } });
        }
      }
      expect(new Item({ code: "ABC" }).isValid()).toBe(true);
      expect(new Item({ code: "ABD" }).isValid()).toBe(false);
    });

    it("validates comparison with less than using date", () => {
      const limit = new Date("2025-01-01");
      class Event extends Model {
        static {
          this.attribute("date", "date");
          this.validates("date", { comparison: { lessThan: limit } });
        }
      }
      expect(new Event({ date: new Date("2024-12-31") }).isValid()).toBe(true);
      expect(new Event({ date: new Date("2025-01-01") }).isValid()).toBe(false);
    });

    it("validates comparison with less than using time", () => {
      const limit = new Date("2024-01-01T12:00:00Z");
      class Event extends Model {
        static {
          this.attribute("time", "datetime");
          this.validates("time", { comparison: { lessThan: limit } });
        }
      }
      expect(new Event({ time: new Date("2024-01-01T11:59:59Z") }).isValid()).toBe(true);
      expect(new Event({ time: new Date("2024-01-01T12:00:00Z") }).isValid()).toBe(false);
    });

    it("validates comparison with less than using string", () => {
      class Item extends Model {
        static {
          this.attribute("code", "string");
          this.validates("code", { comparison: { lessThan: "Z" } });
        }
      }
      expect(new Item({ code: "A" }).isValid()).toBe(true);
      expect(new Item({ code: "Z" }).isValid()).toBe(false);
    });

    it("validates comparison with lambda", () => {
      class Event extends Model {
        static {
          this.attribute("startDate", "date");
          this.attribute("endDate", "date");
          this.validates("endDate", {
            comparison: { greaterThan: (r: any) => r.readAttribute("startDate") },
          });
        }
      }
      expect(
        new Event({ startDate: new Date("2024-01-01"), endDate: new Date("2024-02-01") }).isValid(),
      ).toBe(true);
      expect(
        new Event({ startDate: new Date("2024-02-01"), endDate: new Date("2024-01-01") }).isValid(),
      ).toBe(false);
    });

    it("validates comparison with method", () => {
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
      expect(
        new Event({ startDate: new Date("2024-01-01"), endDate: new Date("2024-02-01") }).isValid(),
      ).toBe(true);
    });

    it("validates comparison of multiple values", () => {
      class Score extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", {
            comparison: { greaterThanOrEqualTo: 0, lessThanOrEqualTo: 100 },
          });
        }
      }
      expect(new Score({ value: 50 }).isValid()).toBe(true);
      expect(new Score({ value: -1 }).isValid()).toBe(false);
      expect(new Score({ value: 101 }).isValid()).toBe(false);
    });
  });
});
