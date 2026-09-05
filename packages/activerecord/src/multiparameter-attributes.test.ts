import { describe, it, expect, beforeAll } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { TimeWithZone } from "@blazetrails/activesupport";
import { Base, composedOf, MultiparameterAssignmentErrors } from "./index.js";
import { withTimezoneConfig } from "./test-helper.js";
import { fixtures } from "./test-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";

const utc = (v: RubyTime) => v.getutc().toTime();

describe("MultiParameterAttributeTest", () => {
  fixtures(["topics"]);

  beforeAll(async () => {
    await Topic.loadSchema();
  });

  it("multiparameter attributes on date", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
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

  it("multiparameter attributes on date with empty year", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "6",
      "last_read(3i)": "24",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty month", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "",
      "last_read(3i)": "24",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty day", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "6",
      "last_read(3i)": "",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty day and year", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "6",
      "last_read(3i)": "",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty day and month", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "",
      "last_read(3i)": "",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty year and month", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "",
      "last_read(3i)": "24",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter attributes on date with all empty", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "",
      "last_read(3i)": "",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter attributes on time", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "0",
    });
    const dt = topic.written_on as RubyTime;
    expect(dt).toBeInstanceOf(RubyTime);
    expect(utc(dt).year).toBe(2004);
    expect(utc(dt).month).toBe(6);
    expect(utc(dt).day).toBe(24);
    expect(utc(dt).hour).toBe(16);
    expect(utc(dt).minute).toBe(24);
    expect(utc(dt).second).toBe(0);
  });

  it("multiparameter attributes on time with no date", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "written_on(1i)": "1",
      "written_on(2i)": "1",
      "written_on(3i)": "1",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
    });
    const dt = topic.written_on as RubyTime;
    expect(dt).toBeInstanceOf(RubyTime);
    expect(utc(dt).hour).toBe(16);
    expect(utc(dt).minute).toBe(24);
  });

  it("multiparameter attributes on time with invalid time params", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "written_on(1i)": "",
      "written_on(2i)": "",
      "written_on(3i)": "",
      "written_on(4i)": "",
      "written_on(5i)": "",
    });
    expect(topic.written_on).toBeNull();
  });

  it("multiparameter attributes on time with old date", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "written_on(1i)": "1850",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "0",
    });
    const dt = topic.written_on as RubyTime;
    expect(dt).toBeInstanceOf(RubyTime);
    expect(utc(dt).year).toBe(1850);
    expect(utc(dt).month).toBe(6);
    expect(utc(dt).day).toBe(24);
    expect(utc(dt).hour).toBe(16);
    expect(utc(dt).minute).toBe(24);
    expect(utc(dt).second).toBe(0);
  });

  it("multiparameter attributes on time will raise on big time if missing date parts", async () => {
    const topic = new Topic();
    expect(() =>
      topic.assignAttributes({ "written_on(4i)": "16", "written_on(5i)": "24" }),
    ).toThrow(MultiparameterAssignmentErrors);
  });

  it("multiparameter attributes on time with raise on small time if missing date parts", async () => {
    const topic = new Topic();
    expect(() => topic.assignAttributes({ "written_on(4i)": "1", "written_on(5i)": "2" })).toThrow(
      MultiparameterAssignmentErrors,
    );
  });

  it("multiparameter attributes on time will ignore hour if missing", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(5i)": "24",
    });
    const dt = topic.written_on as RubyTime;
    expect(utc(dt).year).toBe(2004);
    expect(utc(dt).hour).toBe(0);
  });

  it("multiparameter attributes on time will ignore hour if blank", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "",
      "written_on(5i)": "24",
    });
    const dt = topic.written_on as RubyTime;
    expect(utc(dt).year).toBe(2004);
    expect(utc(dt).hour).toBe(0);
  });

  it("multiparameter attributes on time will ignore date if empty", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "written_on(1i)": "",
      "written_on(2i)": "",
      "written_on(3i)": "",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
    });
    expect(topic.written_on).toBeNull();
  });

  it("multiparameter attributes on time with seconds will ignore date if empty", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
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
    await withTimezoneConfig({ default: "utc" }, async () => {
      const topic = new Topic();
      await topic.assignAttributes({
        "written_on(1i)": "2004",
        "written_on(2i)": "6",
        "written_on(3i)": "24",
        "written_on(4i)": "16",
        "written_on(5i)": "24",
        "written_on(6i)": "00",
      });
      const instant = topic.written_on as RubyTime;
      expect(instant).toBeInstanceOf(RubyTime);
      expect(utc(instant).hour).toBe(16);
      expect(utc(instant).minute).toBe(24);
    });
  });

  it("multiparameter attributes on time with time zone aware attributes", async () => {
    try {
      await withTimezoneConfig(
        { default: "utc", awareAttributes: true, zone: "Pacific Time (US & Canada)" },
        async () => {
          void Topic.resetColumnInformation();
          await Topic.loadSchema();
          const topic = new Topic();
          await topic.assignAttributes({
            "written_on(1i)": "2004",
            "written_on(2i)": "6",
            "written_on(3i)": "24",
            "written_on(4i)": "16",
            "written_on(5i)": "24",
            "written_on(6i)": "00",
          });
          const twz = (topic as any).written_on as TimeWithZone;
          expect(twz).toBeInstanceOf(TimeWithZone);
          expect(twz.utc().toTime().hour).toBe(23);
          expect(twz.hour).toBe(16);
        },
      );
    } finally {
      void Topic.resetColumnInformation();
      await Topic.loadSchema();
    }
  });

  it("multiparameter attributes on time with time zone aware attributes and invalid time params", async () => {
    try {
      await withTimezoneConfig({ awareAttributes: true }, async () => {
        void Topic.resetColumnInformation();
        await Topic.loadSchema();
        const topic = new Topic();
        await topic.assignAttributes({
          "written_on(1i)": "2004",
          "written_on(2i)": "",
          "written_on(3i)": "",
        });
        expect(topic.written_on).toBeNull();
      });
    } finally {
      void Topic.resetColumnInformation();
      await Topic.loadSchema();
    }
  });

  it("multiparameter attributes on time with time zone aware attributes false", async () => {
    try {
      await withTimezoneConfig(
        { default: "local", awareAttributes: false, zone: "Pacific Time (US & Canada)" },
        async () => {
          void Topic.resetColumnInformation();
          await Topic.loadSchema();
          const topic = new Topic();
          await topic.assignAttributes({
            "written_on(1i)": "2004",
            "written_on(2i)": "6",
            "written_on(3i)": "24",
            "written_on(4i)": "16",
            "written_on(5i)": "24",
            "written_on(6i)": "00",
          });
          const val = topic.written_on;
          expect(val).not.toBeInstanceOf(TimeWithZone);
          expect(val).toBeInstanceOf(RubyTime);
        },
      );
    } finally {
      void Topic.resetColumnInformation();
      await Topic.loadSchema();
    }
  });

  it("multiparameter attributes on time with skip time zone conversion for attributes", async () => {
    try {
      await withTimezoneConfig(
        { default: "utc", awareAttributes: true, zone: "Pacific Time (US & Canada)" },
        async () => {
          Topic.skipTimeZoneConversionForAttributes = ["written_on"];
          void Topic.resetColumnInformation();
          await Topic.loadSchema();
          const topic = new Topic();
          await topic.assignAttributes({
            "written_on(1i)": "2004",
            "written_on(2i)": "6",
            "written_on(3i)": "24",
            "written_on(4i)": "16",
            "written_on(5i)": "24",
            "written_on(6i)": "00",
          });
          const val = topic.written_on;
          expect(val).not.toBeInstanceOf(TimeWithZone);
          expect(val).toBeInstanceOf(RubyTime);
          expect((val as RubyTime).getutc().hour).toBe(16);
        },
      );
    } finally {
      Topic.skipTimeZoneConversionForAttributes = [];
      void Topic.resetColumnInformation();
      await Topic.loadSchema();
    }
  });

  it("multiparameter attributes on time only column with time zone aware attributes does not do time zone conversion", async () => {
    try {
      await withTimezoneConfig(
        { default: "utc", awareAttributes: true, zone: "Pacific Time (US & Canada)" },
        async () => {
          void Topic.resetColumnInformation();
          await Topic.loadSchema();
          const topic = new Topic();
          await topic.assignAttributes({
            "bonus_time(1i)": "2000",
            "bonus_time(2i)": "1",
            "bonus_time(3i)": "1",
            "bonus_time(4i)": "16",
            "bonus_time(5i)": "24",
          });
          const bt = (topic as any).bonus_time as TimeWithZone;
          expect(bt).toBeInstanceOf(TimeWithZone);
          expect(bt.hour).toBe(16);
          await topic.assignAttributes({
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
      void Topic.resetColumnInformation();
      await Topic.loadSchema();
    }
  });

  it("multiparameter attributes setting time attribute", () => {
    const topic = new Topic();
    (topic as any).attributes = {
      "written_on(4i)": "13",
      "written_on(5i)": "30",
      "written_on(1i)": "2004",
      "written_on(2i)": "1",
      "written_on(3i)": "1",
    };
    const dt = topic.written_on as RubyTime;
    expect(utc(dt).year).toBe(2004);
    expect(utc(dt).hour).toBe(13);
    expect(utc(dt).minute).toBe(30);
  });

  it("multiparameter attributes on time with empty seconds", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "",
    });
    const dt = topic.written_on as RubyTime;
    expect(utc(dt).year).toBe(2004);
    expect(utc(dt).hour).toBe(16);
    expect(utc(dt).second).toBe(0);
  });

  it("multiparameter attributes setting date attribute", () => {
    const topic = new Topic({
      "written_on(1i)": "1952",
      "written_on(2i)": "3",
      "written_on(3i)": "11",
    });
    const dt = topic.written_on as RubyTime;
    expect(utc(dt).year).toBe(1952);
    expect(utc(dt).month).toBe(3);
    expect(utc(dt).day).toBe(11);
  });

  it("create with multiparameter attributes setting date attribute", () => {
    const topic = Topic.createWith({
      "written_on(1i)": "1952",
      "written_on(2i)": "3",
      "written_on(3i)": "11",
    }).new();
    const dt = topic.written_on as RubyTime;
    expect(utc(dt).year).toBe(1952);
    expect(utc(dt).month).toBe(3);
    expect(utc(dt).day).toBe(11);
  });

  it("multiparameter attributes setting date and time attribute", () => {
    const topic = new Topic({
      "written_on(1i)": "1952",
      "written_on(2i)": "3",
      "written_on(3i)": "11",
      "written_on(4i)": "13",
      "written_on(5i)": "55",
    });
    const dt = topic.written_on as RubyTime;
    expect(utc(dt).year).toBe(1952);
    expect(utc(dt).month).toBe(3);
    expect(utc(dt).day).toBe(11);
    expect(utc(dt).hour).toBe(13);
    expect(utc(dt).minute).toBe(55);
  });

  it("create with multiparameter attributes setting date and time attribute", () => {
    const topic = Topic.createWith({
      "written_on(1i)": "1952",
      "written_on(2i)": "3",
      "written_on(3i)": "11",
      "written_on(4i)": "13",
      "written_on(5i)": "55",
    }).new();
    const dt = topic.written_on as RubyTime;
    expect(utc(dt).year).toBe(1952);
    expect(utc(dt).month).toBe(3);
    expect(utc(dt).day).toBe(11);
    expect(utc(dt).hour).toBe(13);
    expect(utc(dt).minute).toBe(55);
  });

  it("multiparameter attributes setting time but not date on date field", async () => {
    const topic = new Topic();
    await topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "",
      "last_read(3i)": "",
    });
    expect(topic.last_read).toBeNull();
  });

  it("multiparameter assignment of aggregation", async () => {
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
    await customer.assignAttributes({
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

  it("multiparameter assignment of aggregation out of order", async () => {
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
    await customer.assignAttributes({
      "address(3)": "USA",
      "address(1)": "Planet Earth",
      "address(2)": "home",
    });
    const addr = (customer as any).address as Address;
    expect(addr.street).toBe("Planet Earth");
    expect(addr.city).toBe("home");
    expect(addr.country).toBe("USA");
  });

  it("multiparameter assignment of aggregation with missing values", async () => {
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
    await customer.assignAttributes({
      "address(1)": "Planet Earth",
      "address(3)": "USA",
    });
    const addr = (customer as any).address as Address;
    expect(addr.street).toBe("Planet Earth");
    expect(addr.city).toBeNull();
    expect(addr.country).toBe("USA");
  });

  it("multiparameter assignment of aggregation with blank values", async () => {
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
    await customer.assignAttributes({
      "address(1)": "",
      "address(2)": "The City",
      "address(3)": "The Country",
    });
    const addr = (customer as any).address as Address;
    expect(addr.street).toBeNull();
    expect(addr.city).toBe("The City");
    expect(addr.country).toBe("The Country");
  });

  it("multiparameter assignment of aggregation with large index", async () => {
    class Timespan {
      constructor(
        public start: string,
        public end: string,
      ) {}
    }
    class Meeting extends Base {
      static {
        this.attribute("title", "string");
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
    await meeting.assignAttributes({
      "duration(1)": "9am",
      "duration(2)": "5pm",
    });
    const ts = (meeting as any).duration as Timespan;
    expect(ts.start).toBe("9am");
    expect(ts.end).toBe("5pm");
  });

  it("multiparameter assigned attributes did not come from user", () => {
    const topic = new Topic({
      "written_on(1i)": "1952",
      "written_on(2i)": "3",
      "written_on(3i)": "11",
      "written_on(4i)": "13",
      "written_on(5i)": "55",
    });
    expect((topic as unknown as { written_onCameFromUser: boolean }).written_onCameFromUser).toBe(
      false,
    );
  });
});
