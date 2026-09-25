import { describe, it, expect, beforeAll } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import {
  TimeWithZone,
  assertNotRespondTo,
  assertRaise,
  toFs,
  zone as timeZone,
} from "@blazetrails/activesupport";
import { AttributeAssignmentError, MultiparameterAssignmentErrors } from "./index.js";
import { withTimezoneConfig } from "./test-helper.js";
import { fixtures } from "./test-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Address, Customer } from "./test-helpers/models/customer.js";

const utc = (v: RubyTime) => v.getutc().toTime();

describe("MultiParameterAttributeTest", () => {
  fixtures(["topics"]);

  beforeAll(async () => {
    await Topic.loadSchema();
    await Customer.loadSchema();
  });

  it("multiparameter attributes on date", async () => {
    const topic = await Topic.find(1);
    await topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "6",
      "last_read(3i)": "24",
    });
    expect(topic.last_read).toEqual(Temporal.PlainDate.from({ year: 2004, month: 6, day: 24 }));
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
    await withTimezoneConfig({ default: "local" }, async () => {
      const topic = await Topic.find(1);
      await topic.assignAttributes({
        "written_on(1i)": "2004",
        "written_on(2i)": "6",
        "written_on(3i)": "24",
        "written_on(4i)": "16",
        "written_on(5i)": "24",
        "written_on(6i)": "00",
      });
      expect(topic.written_on).toEqual(RubyTime.local(2004, 6, 24, 16, 24, 0));
    });
  });

  it("multiparameter attributes on time with no date", async () => {
    const ex = (await assertRaise([MultiparameterAssignmentErrors], {}, async () => {
      const attributes = {
        "written_on(4i)": "16",
        "written_on(5i)": "24",
        "written_on(6i)": "00",
      };
      const topic = await Topic.find(1);
      await topic.assignAttributes(attributes);
    })) as MultiparameterAssignmentErrors;
    expect((ex.errors[0] as AttributeAssignmentError).attribute).toBe("written_on");
  });

  it("multiparameter attributes on time with invalid time params", async () => {
    const ex = (await assertRaise([MultiparameterAssignmentErrors], {}, async () => {
      const attributes = {
        "written_on(1i)": "2004",
        "written_on(2i)": "6",
        "written_on(3i)": "24",
        "written_on(4i)": "2004",
        "written_on(5i)": "36",
        "written_on(6i)": "64",
      };
      const topic = await Topic.find(1);
      await topic.assignAttributes(attributes);
    })) as MultiparameterAssignmentErrors;
    expect((ex.errors[0] as AttributeAssignmentError).attribute).toBe("written_on");
  });

  it("multiparameter attributes on time with old date", async () => {
    const topic = await Topic.find(1);
    await topic.assignAttributes({
      "written_on(1i)": "1850",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "00",
    });
    expect(toFs(topic.written_on as RubyTime, "db")).toBe("1850-06-24 16:24:00");
  });

  it("multiparameter attributes on time will raise on big time if missing date parts", async () => {
    const ex = (await assertRaise([MultiparameterAssignmentErrors], {}, async () => {
      const attributes = {
        "written_on(4i)": "16",
        "written_on(5i)": "24",
      };
      const topic = await Topic.find(1);
      await topic.assignAttributes(attributes);
    })) as MultiparameterAssignmentErrors;
    expect((ex.errors[0] as AttributeAssignmentError).attribute).toBe("written_on");
  });

  it("multiparameter attributes on time with raise on small time if missing date parts", async () => {
    const ex = (await assertRaise([MultiparameterAssignmentErrors], {}, async () => {
      const attributes = {
        "written_on(4i)": "16",
        "written_on(5i)": "12",
        "written_on(6i)": "02",
      };
      const topic = await Topic.find(1);
      await topic.assignAttributes(attributes);
    })) as MultiparameterAssignmentErrors;
    expect((ex.errors[0] as AttributeAssignmentError).attribute).toBe("written_on");
  });

  it.skip("multiparameter attributes on time will ignore hour if missing", async () => {
    await withTimezoneConfig({ default: "local" }, async () => {
      const attributes = {
        "written_on(1i)": "2004",
        "written_on(2i)": "12",
        "written_on(3i)": "12",
        "written_on(5i)": "12",
        "written_on(6i)": "02",
      };
      const topic = await Topic.find(1);
      await topic.assignAttributes(attributes);
      expect((topic.written_on as RubyTime).valueOf()).toEqual(
        RubyTime.local(2004, 12, 12, 0, 12, 2).valueOf(),
      );
    });
  });

  it("multiparameter attributes on time will ignore hour if blank", async () => {
    const topic = await Topic.find(1);
    await topic.assignAttributes({
      "written_on(1i)": "",
      "written_on(2i)": "",
      "written_on(3i)": "",
      "written_on(4i)": "",
      "written_on(5i)": "12",
      "written_on(6i)": "02",
    });
    expect(topic.written_on).toBeNull();
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
      const topic = await Topic.find(1);
      await topic.assignAttributes({
        "written_on(1i)": "2004",
        "written_on(2i)": "6",
        "written_on(3i)": "24",
        "written_on(4i)": "16",
        "written_on(5i)": "24",
        "written_on(6i)": "00",
      });
      expect(topic.written_on).toEqual(RubyTime.utc(2004, 6, 24, 16, 24, 0));
    });
  });

  it("multiparameter attributes on time with time zone aware attributes", async () => {
    try {
      await withTimezoneConfig(
        { default: "utc", awareAttributes: true, zone: "Pacific Time (US & Canada)" },
        async () => {
          void Topic.resetColumnInformation();
          await Topic.loadSchema();
          const attributes = {
            "written_on(1i)": "2004",
            "written_on(2i)": "6",
            "written_on(3i)": "24",
            "written_on(4i)": "16",
            "written_on(5i)": "24",
            "written_on(6i)": "00",
          };
          const topic = await Topic.find(1);
          await topic.assignAttributes(attributes);
          const twz = topic.written_on as unknown as TimeWithZone;
          expect(twz.utc().valueOf()).toEqual(RubyTime.utc(2004, 6, 24, 23, 24, 0).valueOf());
          expect(twz.time.valueOf()).toEqual(RubyTime.utc(2004, 6, 24, 16, 24, 0).valueOf());
          expect(twz.timeZone).toEqual(timeZone());
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

  it.skip("multiparameter attributes on time with time zone aware attributes false", async () => {
    await withTimezoneConfig(
      { default: "local", awareAttributes: false, zone: "Pacific Time (US & Canada)" },
      async () => {
        const attributes = {
          "written_on(1i)": "2004",
          "written_on(2i)": "6",
          "written_on(3i)": "24",
          "written_on(4i)": "16",
          "written_on(5i)": "24",
          "written_on(6i)": "00",
        };
        const topic = await Topic.find(1);
        await topic.assignAttributes(attributes);
        expect((topic.written_on as RubyTime).valueOf()).toEqual(
          RubyTime.local(2004, 6, 24, 16, 24, 0).valueOf(),
        );
        assertNotRespondTo(topic.written_on, "timeZone");
      },
    );
  });

  it("multiparameter attributes on time with skip time zone conversion for attributes", async () => {
    try {
      await withTimezoneConfig(
        { default: "utc", awareAttributes: true, zone: "Pacific Time (US & Canada)" },
        async () => {
          Topic.skipTimeZoneConversionForAttributes = ["written_on"];
          void Topic.resetColumnInformation();
          await Topic.loadSchema();
          const attributes = {
            "written_on(1i)": "2004",
            "written_on(2i)": "6",
            "written_on(3i)": "24",
            "written_on(4i)": "16",
            "written_on(5i)": "24",
            "written_on(6i)": "00",
          };
          const topic = await Topic.find(1);
          await topic.assignAttributes(attributes);
          expect((topic.written_on as RubyTime).valueOf()).toEqual(
            RubyTime.utc(2004, 6, 24, 16, 24, 0).valueOf(),
          );
          assertNotRespondTo(topic.written_on, "timeZone");
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
          let attributes: Record<string, string> = {
            "bonus_time(1i)": "2000",
            "bonus_time(2i)": "1",
            "bonus_time(3i)": "1",
            "bonus_time(4i)": "16",
            "bonus_time(5i)": "24",
          };
          const topic = await Topic.find(1);
          await topic.assignAttributes(attributes);
          const bonusTime = topic.bonus_time as unknown as TimeWithZone;
          expect(bonusTime.valueOf()).toEqual(timeZone()!.local(2000, 1, 1, 16, 24, 0).valueOf());
          expect(bonusTime.isUtc()).toBeFalsy();

          attributes = {
            "written_on(1i)": "2000",
            "written_on(2i)": "",
            "written_on(3i)": "",
            "written_on(4i)": "",
            "written_on(5i)": "",
          };
          await topic.assignAttributes(attributes);
          expect(topic.written_on).toBeNull();
        },
      );
    } finally {
      void Topic.resetColumnInformation();
      await Topic.loadSchema();
    }
  });

  it("multiparameter attributes setting time attribute", () => {
    const topic = new Topic({ "bonus_time(4i)": "01", "bonus_time(5i)": "05" });
    expect((topic.bonus_time as RubyTime).hour).toBe(1);
    expect((topic.bonus_time as RubyTime).min).toBe(5);
  });

  it.skip("multiparameter attributes on time with empty seconds", async () => {
    await withTimezoneConfig({ default: "local" }, async () => {
      const attributes = {
        "written_on(1i)": "2004",
        "written_on(2i)": "6",
        "written_on(3i)": "24",
        "written_on(4i)": "16",
        "written_on(5i)": "24",
        "written_on(6i)": "",
      };
      const topic = await Topic.find(1);
      await topic.assignAttributes(attributes);
      console.log(
        "DBG",
        String(topic.written_on),
        (topic.written_on as any)?.constructor?.name,
        (topic.written_on as any)?.valueOf?.(),
        String(RubyTime.local(2004, 6, 24, 16, 24, 0)),
        RubyTime.local(2004, 6, 24, 16, 24, 0).valueOf(),
      );
      expect(topic.written_on).toEqual(RubyTime.local(2004, 6, 24, 16, 24, 0));
    });
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
    await assertRaise(
      [MultiparameterAssignmentErrors],
      {},
      () => new Topic({ "written_on(4i)": "13", "written_on(5i)": "55" }),
    );
  });

  it("multiparameter assignment of aggregation", async () => {
    const customer = new Customer();
    const address = new Address("The Street", "The City", "The Country");
    const attributes = {
      "address(1)": address.street,
      "address(2)": address.city,
      "address(3)": address.country,
    };
    await customer.assignAttributes(attributes);
    expect(customer.address).toEqual(address);
  });

  it("multiparameter assignment of aggregation out of order", async () => {
    const customer = new Customer();
    const address = new Address("The Street", "The City", "The Country");
    const attributes = {
      "address(3)": address.country,
      "address(2)": address.city,
      "address(1)": address.street,
    };
    await customer.assignAttributes(attributes);
    expect(customer.address).toEqual(address);
  });

  it("multiparameter assignment of aggregation with missing values", async () => {
    const ex = (await assertRaise([MultiparameterAssignmentErrors], {}, async () => {
      const customer = new Customer();
      const address = new Address("The Street", "The City", "The Country");
      const attributes = { "address(2)": address.city, "address(3)": address.country };
      await customer.assignAttributes(attributes);
    })) as MultiparameterAssignmentErrors;
    expect((ex.errors[0] as AttributeAssignmentError).attribute).toBe("address");
  });

  it("multiparameter assignment of aggregation with blank values", async () => {
    const customer = new Customer();
    const address = new Address("The Street", "The City", "The Country");
    const attributes = {
      "address(1)": "",
      "address(2)": address.city,
      "address(3)": address.country,
    };
    await customer.assignAttributes(attributes);
    expect(customer.address).toEqual(
      new Address(null as unknown as string, "The City", "The Country"),
    );
  });

  it("multiparameter assignment of aggregation with large index", async () => {
    const ex = (await assertRaise([MultiparameterAssignmentErrors], {}, async () => {
      const customer = new Customer();
      const address = new Address("The Street", "The City", "The Country");
      const attributes = {
        "address(1)": "The Street",
        "address(2)": address.city,
        "address(3000)": address.country,
      };
      await customer.assignAttributes(attributes);
    })) as MultiparameterAssignmentErrors;

    expect((ex.errors[0] as AttributeAssignmentError).attribute).toBe("address");
  });

  it("multiparameter assigned attributes did not come from user", () => {
    const topic = new Topic({
      "written_on(1i)": "1952",
      "written_on(2i)": "3",
      "written_on(3i)": "11",
      "written_on(4i)": "13",
      "written_on(5i)": "55",
    });
    expect(
      (topic as unknown as { written_onCameFromUser: boolean }).written_onCameFromUser,
    ).toBeFalsy();
  });
});
