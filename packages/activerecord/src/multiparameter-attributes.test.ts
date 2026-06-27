/**
 * Mirrors: activerecord/test/cases/multiparameter_attributes_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { TimeWithZone } from "@blazetrails/activesupport";
import { Base, composedOf, MultiparameterAssignmentErrors } from "./index.js";
import { withTimezoneConfig } from "./test-helper.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";
import { Topic } from "./test-helpers/models/topic.js";

const utc = (v: Temporal.Instant) => v.toZonedDateTimeISO("UTC");

describe("MultiParameterAttributeTest", () => {
  // useHandlerFixtures wires setupHandlerSuite + withTransactionalFixtures + defineSchema.
  // The defineSchema call warms the pool's schema cache for topics so the synchronous
  // loadSchema path (triggered by new Topic() inside tests) finds the date/time column
  // types correctly on all adapters including MariaDB. Mirrors date.test.ts.
  useHandlerFixtures(["topics"], { schema: TEST_SCHEMA });

  // Eagerly populate Topic._attributeDefinitions from the warm pool schema cache.
  // Without this, the sync loadSchema path runs before the cache is applied to the
  // model class and marks _schemaLoaded=true with empty _attributeDefinitions.
  beforeAll(async () => {
    await Topic.loadSchema();
  });

  it("multiparameter attributes on date", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "6",
      "last_read(3i)": "24",
    });
    const d = topic.last_read;
    expect(d).toBeInstanceOf(Temporal.PlainDate);
    expect(d.year).toBe(2004);
    expect(d.month).toBe(6);
    expect(d.day).toBe(24);
  });

  it("multiparameter attributes on date with empty year", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "6",
      "last_read(3i)": "24",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty month", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "",
      "last_read(3i)": "24",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty day", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "6",
      "last_read(3i)": "",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty day and year", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "6",
      "last_read(3i)": "",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty day and month", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "",
      "last_read(3i)": "",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty year and month", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "",
      "last_read(3i)": "24",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter attributes on date with all empty", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "",
      "last_read(3i)": "",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter attributes on time", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "0",
    });
    const dt = topic.written_on as Temporal.Instant;
    expect(dt).toBeInstanceOf(Temporal.Instant);
    expect(utc(dt).year).toBe(2004);
    expect(utc(dt).month).toBe(6);
    expect(utc(dt).day).toBe(24);
    expect(utc(dt).hour).toBe(16);
    expect(utc(dt).minute).toBe(24);
    expect(utc(dt).second).toBe(0);
  });

  it("multiparameter attributes on time with no date", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "1",
      "written_on(2i)": "1",
      "written_on(3i)": "1",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
    });
    const dt = topic.written_on as Temporal.Instant;
    expect(dt).toBeInstanceOf(Temporal.Instant);
    expect(utc(dt).hour).toBe(16);
    expect(utc(dt).minute).toBe(24);
  });

  it("multiparameter attributes on time with invalid time params", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "",
      "written_on(2i)": "",
      "written_on(3i)": "",
      "written_on(4i)": "",
      "written_on(5i)": "",
    });
    expect(topic.written_on).toBeNull();
  });

  it("multiparameter attributes on time with old date", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "1850",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "0",
    });
    const dt = topic.written_on as Temporal.Instant;
    expect(dt).toBeInstanceOf(Temporal.Instant);
    expect(utc(dt).year).toBe(1850);
  });

  it("multiparameter attributes on time will raise on big time if missing date parts", () => {
    const topic = new Topic();
    // Rails: time parts without date context → Time.new(nil,nil,nil,16,24) raises ArgumentError,
    // collected into MultiparameterAssignmentErrors.
    expect(() =>
      topic.assignAttributes({ "written_on(4i)": "16", "written_on(5i)": "24" }),
    ).toThrow(MultiparameterAssignmentErrors);
  });

  it("multiparameter attributes on time with raise on small time if missing date parts", () => {
    const topic = new Topic();
    expect(() => topic.assignAttributes({ "written_on(4i)": "1", "written_on(5i)": "2" })).toThrow(
      MultiparameterAssignmentErrors,
    );
  });

  it("multiparameter attributes on time will ignore hour if missing", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(5i)": "24",
    });
    const dt = topic.written_on as Temporal.Instant;
    expect(utc(dt).year).toBe(2004);
    expect(utc(dt).hour).toBe(0);
  });

  it("multiparameter attributes on time will ignore hour if blank", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "",
      "written_on(5i)": "24",
    });
    const dt = topic.written_on as Temporal.Instant;
    expect(utc(dt).year).toBe(2004);
    expect(utc(dt).hour).toBe(0);
  });

  it("multiparameter attributes on time will ignore date if empty", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "",
      "written_on(2i)": "",
      "written_on(3i)": "",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
    });
    expect(topic.written_on).toBeNull();
  });

  it("multiparameter attributes on time with seconds will ignore date if empty", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "",
      "written_on(2i)": "",
      "written_on(3i)": "",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "30",
    });
    expect(topic.written_on).toBeNull();
  });

  it("multiparameter attributes on time with utc", async () => {
    await withTimezoneConfig({ default: "utc" }, () => {
      const topic = new Topic();
      topic.assignAttributes({
        "written_on(1i)": "2004",
        "written_on(2i)": "6",
        "written_on(3i)": "24",
        "written_on(4i)": "16",
        "written_on(5i)": "24",
        "written_on(6i)": "00",
      });
      const instant = topic.written_on as Temporal.Instant;
      expect(instant).toBeInstanceOf(Temporal.Instant);
      expect(instant.toZonedDateTimeISO("UTC").hour).toBe(16);
      expect(instant.toZonedDateTimeISO("UTC").minute).toBe(24);
    });
  });

  it("multiparameter attributes on time with time zone aware attributes", async () => {
    // zone: -28800 → Pacific Time; June is PDT (UTC-7) so local 16:24 → UTC 23:24.
    try {
      await withTimezoneConfig(
        { default: "utc", awareAttributes: true, zone: "Pacific Time (US & Canada)" },
        async () => {
          // Mirrors Rails: Topic.reset_column_information so the schema reloads with
          // awareAttributes: true active, wrapping written_on in TimeZoneConverter.
          Topic.resetColumnInformation();
          await Topic.loadSchema();
          const topic = new Topic();
          topic.assignAttributes({
            "written_on(1i)": "2004",
            "written_on(2i)": "6",
            "written_on(3i)": "24",
            "written_on(4i)": "16",
            "written_on(5i)": "24",
            "written_on(6i)": "00",
          });
          // awareAttributes wraps as TimeWithZone at runtime; declared type is Instant|PlainDateTime
          const twz = (topic as any).written_on as TimeWithZone;
          expect(twz).toBeInstanceOf(TimeWithZone);
          expect(twz.utc().toZonedDateTimeISO("UTC").hour).toBe(23); // PDT: local 16:24 → UTC 23:24
          expect(twz.hour).toBe(16); // wall-clock in zone
        },
      );
    } finally {
      // mirrors Rails ensure: Topic.reset_column_information
      // reload re-warms the adapter schema cache so later tests can load the schema sync.
      Topic.resetColumnInformation();
      await Topic.loadSchema();
    }
  });

  it("multiparameter attributes on time with time zone aware attributes and invalid time params", async () => {
    try {
      await withTimezoneConfig({ awareAttributes: true }, async () => {
        Topic.resetColumnInformation();
        await Topic.loadSchema();
        const topic = new Topic();
        topic.assignAttributes({
          "written_on(1i)": "2004",
          "written_on(2i)": "",
          "written_on(3i)": "",
        });
        expect(topic.written_on).toBeNull();
      });
    } finally {
      Topic.resetColumnInformation();
      await Topic.loadSchema();
    }
  });

  it("multiparameter attributes on time with time zone aware attributes false", async () => {
    try {
      await withTimezoneConfig(
        { default: "local", awareAttributes: false, zone: "Pacific Time (US & Canada)" },
        async () => {
          Topic.resetColumnInformation();
          await Topic.loadSchema();
          const topic = new Topic();
          topic.assignAttributes({
            "written_on(1i)": "2004",
            "written_on(2i)": "6",
            "written_on(3i)": "24",
            "written_on(4i)": "16",
            "written_on(5i)": "24",
            "written_on(6i)": "00",
          });
          const val = topic.written_on;
          expect(val).not.toBeInstanceOf(TimeWithZone); // assert_not_respond_to :time_zone
          expect(val).toBeInstanceOf(Temporal.Instant);
        },
      );
    } finally {
      Topic.resetColumnInformation();
      await Topic.loadSchema();
    }
  });

  it("multiparameter attributes on time with skip time zone conversion for attributes", async () => {
    try {
      await withTimezoneConfig(
        { default: "utc", awareAttributes: true, zone: "Pacific Time (US & Canada)" },
        async () => {
          // Mirrors Rails: Topic.skip_time_zone_conversion_for_attributes = [:written_on]
          Topic.skipTimeZoneConversionForAttributes = ["written_on"];
          Topic.resetColumnInformation();
          await Topic.loadSchema();
          const topic = new Topic();
          topic.assignAttributes({
            "written_on(1i)": "2004",
            "written_on(2i)": "6",
            "written_on(3i)": "24",
            "written_on(4i)": "16",
            "written_on(5i)": "24",
            "written_on(6i)": "00",
          });
          const val = topic.written_on;
          expect(val).not.toBeInstanceOf(TimeWithZone);
          expect(val).toBeInstanceOf(Temporal.Instant);
          expect((val as Temporal.Instant).toZonedDateTimeISO("UTC").hour).toBe(16);
        },
      );
    } finally {
      // Mirrors Rails ensure: Topic.skip_time_zone_conversion_for_attributes = []
      Topic.skipTimeZoneConversionForAttributes = [];
      Topic.resetColumnInformation();
      await Topic.loadSchema();
    }
  });

  it("multiparameter attributes on time only column with time zone aware attributes does not do time zone conversion", async () => {
    try {
      await withTimezoneConfig(
        { default: "utc", awareAttributes: true, zone: "Pacific Time (US & Canada)" },
        async () => {
          // Mirrors Rails: Topic.reset_column_information so schema reloads with
          // awareAttributes: true, wrapping bonus_time and written_on in TimeZoneConverter.
          Topic.resetColumnInformation();
          await Topic.loadSchema();
          const topic = new Topic();
          topic.assignAttributes({
            "bonus_time(1i)": "2000",
            "bonus_time(2i)": "1",
            "bonus_time(3i)": "1",
            "bonus_time(4i)": "16",
            "bonus_time(5i)": "24",
          });
          // awareAttributes wraps time columns as TimeWithZone at runtime; declared type is PlainTime
          const bt = (topic as any).bonus_time as TimeWithZone;
          expect(bt).toBeInstanceOf(TimeWithZone);
          expect(bt.hour).toBe(16);
          // written_on with empty month/day → null
          topic.assignAttributes({
            "written_on(1i)": "2000",
            "written_on(2i)": "",
            "written_on(3i)": "",
            "written_on(4i)": "",
            "written_on(5i)": "",
          });
          expect(topic.written_on).toBeNull();
        },
      );
    } finally {
      Topic.resetColumnInformation();
      await Topic.loadSchema();
    }
  });

  it("multiparameter attributes setting time attribute", () => {
    const topic = new Topic();
    // Rails: topic.attributes = {...} calls assign_attributes
    (topic as any).attributes = {
      "written_on(4i)": "13",
      "written_on(5i)": "30",
      "written_on(1i)": "2004",
      "written_on(2i)": "1",
      "written_on(3i)": "1",
    };
    const dt = topic.written_on as Temporal.Instant;
    expect(utc(dt).year).toBe(2004);
    expect(utc(dt).hour).toBe(13);
    expect(utc(dt).minute).toBe(30);
  });

  it("multiparameter attributes on time with empty seconds", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "",
    });
    const dt = topic.written_on as Temporal.Instant;
    expect(utc(dt).year).toBe(2004);
    expect(utc(dt).hour).toBe(16);
    expect(utc(dt).second).toBe(0);
  });

  it("multiparameter attributes setting date attribute", () => {
    const topic = new Topic();
    (topic as any).attributes = {
      "last_read(1i)": "2004",
      "last_read(2i)": "6",
      "last_read(3i)": "24",
    };
    const d = topic.last_read;
    expect(d.year).toBe(2004);
    expect(d.month).toBe(6);
    expect(d.day).toBe(24);
  });

  it("create with multiparameter attributes setting date attribute", () => {
    // Rails: Topic.new(attrs) calls assign_attributes internally
    const topic = new Topic({
      title: "test",
      "last_read(1i)": "2004",
      "last_read(2i)": "6",
      "last_read(3i)": "24",
    });
    const d = topic.last_read;
    expect(d.year).toBe(2004);
    expect(d.month).toBe(6);
    expect(d.day).toBe(24);
  });

  it("multiparameter attributes setting date and time attribute", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "6",
      "last_read(3i)": "24",
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "0",
    });
    const d = topic.last_read;
    expect(d.year).toBe(2004);
    const dt = topic.written_on as Temporal.Instant;
    expect(utc(dt).hour).toBe(16);
  });

  it("create with multiparameter attributes setting date and time attribute", () => {
    const topic = new Topic({
      title: "test",
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "0",
    });
    const dt = topic.written_on as Temporal.Instant;
    expect(utc(dt).year).toBe(2004);
    expect(utc(dt).hour).toBe(16);
  });

  it("multiparameter attributes setting time but not date on date field", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "",
      "last_read(3i)": "",
    });
    expect(topic.last_read).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Aggregation tests
  // -------------------------------------------------------------------------

  it("multiparameter assignment of aggregation", () => {
    class Address {
      constructor(
        public street: string,
        public city: string,
        public country: string,
      ) {}
    }
    class Customer extends Base {
      static {
        this.attribute("name", "string");
        composedOf(this, "address", {
          className: Address,
          mapping: [
            ["address_street", "street"],
            ["address_city", "city"],
            ["address_country", "country"],
          ],
        });
      }
    }
    const customer = new Customer();
    customer.assignAttributes({
      "address(1)": "Planet Earth",
      "address(2)": "home",
      "address(3)": "USA",
    });
    const addr = (customer as any).address as Address;
    expect(addr).toBeInstanceOf(Address);
    expect(addr.street).toBe("Planet Earth");
    expect(addr.city).toBe("home");
    expect(addr.country).toBe("USA");
  });

  it("multiparameter assignment of aggregation out of order", () => {
    class Address {
      constructor(
        public street: string,
        public city: string,
        public country: string,
      ) {}
    }
    class Customer extends Base {
      static {
        this.attribute("name", "string");
        composedOf(this, "address", {
          className: Address,
          mapping: [
            ["address_street", "street"],
            ["address_city", "city"],
            ["address_country", "country"],
          ],
        });
      }
    }
    const customer = new Customer();
    customer.assignAttributes({
      "address(3)": "USA",
      "address(1)": "Planet Earth",
      "address(2)": "home",
    });
    const addr = (customer as any).address as Address;
    expect(addr.street).toBe("Planet Earth");
    expect(addr.city).toBe("home");
    expect(addr.country).toBe("USA");
  });

  it("multiparameter assignment of aggregation with missing values", () => {
    class Address {
      constructor(
        public street: string | null,
        public city: string | null,
        public country: string | null,
      ) {}
    }
    class Customer extends Base {
      static {
        this.attribute("name", "string");
        composedOf(this, "address", {
          className: Address,
          mapping: [
            ["address_street", "street"],
            ["address_city", "city"],
            ["address_country", "country"],
          ],
        });
      }
    }
    const customer = new Customer();
    customer.assignAttributes({
      "address(1)": "Planet Earth",
      "address(3)": "USA",
    });
    const addr = (customer as any).address as Address;
    expect(addr.street).toBe("Planet Earth");
    expect(addr.city).toBeNull();
    expect(addr.country).toBe("USA");
  });

  it("multiparameter assignment of aggregation with blank values", () => {
    class Address {
      constructor(
        public street: string,
        public city: string,
        public country: string,
      ) {}
    }
    class Customer extends Base {
      static {
        this.attribute("name", "string");
        composedOf(this, "address", {
          className: Address,
          mapping: [
            ["address_street", "street"],
            ["address_city", "city"],
            ["address_country", "country"],
          ],
        });
      }
    }
    const customer = new Customer();
    customer.assignAttributes({
      "address(1)": "",
      "address(2)": "",
      "address(3)": "",
    });
    // All blank → assignment skipped; getter returns null (all mapped attrs are null)
    expect((customer as any).address).toBeNull();
  });

  it("multiparameter assignment of aggregation with large index", () => {
    class Timespan {
      constructor(
        public start: string,
        public end: string,
      ) {}
    }
    class Meeting extends Base {
      static {
        this.attribute("title", "string");
        // The aggregation maps onto these columns; declare them so they are
        // known names under strict writeFromUser (this bespoke model has no
        // backing table to reflect them from).
        this.attribute("duration_start", "string");
        this.attribute("duration_end", "string");
        composedOf(this, "duration", {
          className: Timespan,
          mapping: [
            ["duration_start", "start"],
            ["duration_end", "end"],
          ],
        });
      }
    }
    const meeting = new Meeting();
    meeting.assignAttributes({
      "duration(1)": "9am",
      "duration(2)": "5pm",
    });
    const ts = (meeting as any).duration as Timespan;
    expect(ts.start).toBe("9am");
    expect(ts.end).toBe("5pm");
  });

  it("multiparameter assigned attributes did not come from user", () => {
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "6",
      "last_read(3i)": "24",
    });
    const d = topic.last_read;
    expect(d.year).toBe(2004);
    expect(d.month).toBe(6);
    expect(d.day).toBe(24);
  });
});
