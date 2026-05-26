/**
 * Tests for ActiveRecord::AttributeAssignment
 * Mirrors: activerecord/test/cases/attribute_assignment_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Base } from "./index.js";
import { typeCastAttributeValue, findParameterPosition } from "./attribute-assignment.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

const TEST_SCHEMA = {
  topics: { title: "string", author: "string" },
  people: { born_on: "date" },
  events: { title: "string", starts_at: "datetime", starts_on: "date" },
} as const;

// ==========================================================================
// AttributeAssignmentTest — targets attribute_assignment_test.rb
// ==========================================================================
describe("AttributeAssignmentTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });
  it("bulk assign attributes", () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("title", "string");
        this.attribute("author", "string");
      }
    }
    const topic = new Topic();
    topic.assignAttributes({ title: "Hello", author: "World" });
    expect(topic.readAttribute("title")).toBe("Hello");
    expect(topic.readAttribute("author")).toBe("World");
  });

  it("multiparameter date assignment", () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("born_on", "date");
      }
    }
    const person = new Person();
    person.assignAttributes({
      "born_on(1i)": "1990",
      "born_on(2i)": "1",
      "born_on(3i)": "15",
    });
    const born = person.readAttribute("born_on");
    expect(born).toBeInstanceOf(Temporal.PlainDate);
    const d = born as Temporal.PlainDate;
    expect(d.year).toBe(1990);
    expect(d.month).toBe(1);
    expect(d.day).toBe(15);
  });

  it("multiparameter datetime assignment", () => {
    class Event extends Base {
      static {
        this._tableName = "events";
        this.attribute("starts_at", "datetime");
      }
    }
    const event = new Event();
    event.assignAttributes({
      "starts_at(1i)": "2024",
      "starts_at(2i)": "6",
      "starts_at(3i)": "15",
      "starts_at(4i)": "9",
      "starts_at(5i)": "30",
      "starts_at(6i)": "0",
    });
    const dt = event.readAttribute("starts_at") as Temporal.Instant;
    expect(dt).toBeInstanceOf(Temporal.Instant);
    // Cast goes through DateTimeType: PlainDateTime → Instant in UTC
    const pdt = dt.toZonedDateTimeISO("UTC").toPlainDateTime();
    expect(pdt.year).toBe(2024);
    expect(pdt.month).toBe(6);
    expect(pdt.day).toBe(15);
    expect(pdt.hour).toBe(9);
    expect(pdt.minute).toBe(30);
  });

  it("all blank multiparameter values sets attribute to null", () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("born_on", "date");
      }
    }
    const person = new Person();
    person.assignAttributes({ "born_on(1i)": "", "born_on(2i)": "", "born_on(3i)": "" });
    expect(person.readAttribute("born_on")).toBeNull();
  });

  it("regular and multiparameter keys coexist in same assignAttributes call", () => {
    class Event extends Base {
      static {
        this._tableName = "events";
        this.attribute("title", "string");
        this.attribute("starts_on", "date");
      }
    }
    const event = new Event();
    event.assignAttributes({
      title: "Conf",
      "starts_on(1i)": "2025",
      "starts_on(2i)": "3",
      "starts_on(3i)": "10",
    });
    expect(event.readAttribute("title")).toBe("Conf");
    const d = event.readAttribute("starts_on") as Temporal.PlainDate;
    expect(d.year).toBe(2025);
  });

  // Helpers
  describe("typeCastAttributeValue", () => {
    it("casts integer suffix", () => {
      expect(typeCastAttributeValue("written_on(1i)", "2004")).toBe(2004);
    });

    it("casts float suffix", () => {
      expect(typeCastAttributeValue("amount(1f)", "3.14")).toBeCloseTo(3.14);
    });

    it("returns string when no type suffix", () => {
      expect(typeCastAttributeValue("written_on(1)", "2004")).toBe("2004");
    });

    it("returns 0 for blank integer (mirrors Ruby String#to_i)", () => {
      expect(typeCastAttributeValue("written_on(1i)", "")).toBe(0);
    });

    it("returns 0.0 for blank float (mirrors Ruby String#to_f)", () => {
      expect(typeCastAttributeValue("amount(1f)", "")).toBe(0.0);
    });
  });

  describe("findParameterPosition", () => {
    it("returns position from multiparameter name", () => {
      expect(findParameterPosition("written_on(1i)")).toBe(1);
      expect(findParameterPosition("written_on(3)")).toBe(3);
    });
  });
});
