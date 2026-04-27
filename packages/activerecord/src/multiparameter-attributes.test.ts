/**
 * Mirrors: activerecord/test/cases/multiparameter_attributes_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Base, composedOf, MultiparameterAssignmentErrors } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("MultiParameterAttributeTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("multiparameter attributes on date", () => {
    class Topic extends Base {
      static {
        this.attribute("last_read", "date");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "6",
      "last_read(3i)": "24",
    });
    const d = (topic as any).last_read as Temporal.PlainDate;
    expect(d).toBeInstanceOf(Temporal.PlainDate);
    expect(d.year).toBe(2004);
    expect(d.month).toBe(6);
    expect(d.day).toBe(24);
  });

  it("multiparameter attributes on date with empty year", () => {
    class Topic extends Base {
      static {
        this.attribute("last_read", "date");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "6",
      "last_read(3i)": "24",
    });
    expect((topic as any).last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty month", () => {
    class Topic extends Base {
      static {
        this.attribute("last_read", "date");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "",
      "last_read(3i)": "24",
    });
    expect((topic as any).last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty day", () => {
    class Topic extends Base {
      static {
        this.attribute("last_read", "date");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "6",
      "last_read(3i)": "",
    });
    expect((topic as any).last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty day and year", () => {
    class Topic extends Base {
      static {
        this.attribute("last_read", "date");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "6",
      "last_read(3i)": "",
    });
    expect((topic as any).last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty day and month", () => {
    class Topic extends Base {
      static {
        this.attribute("last_read", "date");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "",
      "last_read(3i)": "",
    });
    expect((topic as any).last_read).toBeNull();
  });

  it("multiparameter attributes on date with empty year and month", () => {
    class Topic extends Base {
      static {
        this.attribute("last_read", "date");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "",
      "last_read(3i)": "24",
    });
    expect((topic as any).last_read).toBeNull();
  });

  it("multiparameter attributes on date with all empty", () => {
    class Topic extends Base {
      static {
        this.attribute("last_read", "date");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "",
      "last_read(3i)": "",
    });
    expect((topic as any).last_read).toBeNull();
  });

  it("multiparameter attributes on time", () => {
    class Topic extends Base {
      static {
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "0",
    });
    const dt = (topic as any).written_on as Temporal.PlainDateTime;
    expect(dt).toBeInstanceOf(Temporal.PlainDateTime);
    expect(dt.year).toBe(2004);
    expect(dt.month).toBe(6);
    expect(dt.day).toBe(24);
    expect(dt.hour).toBe(16);
    expect(dt.minute).toBe(24);
    expect(dt.second).toBe(0);
  });

  it("multiparameter attributes on time with no date", () => {
    class Topic extends Base {
      static {
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "1",
      "written_on(2i)": "1",
      "written_on(3i)": "1",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
    });
    const dt = (topic as any).written_on as Temporal.PlainDateTime;
    expect(dt).toBeInstanceOf(Temporal.PlainDateTime);
    expect(dt.hour).toBe(16);
    expect(dt.minute).toBe(24);
  });

  it("multiparameter attributes on time with invalid time params", () => {
    class Topic extends Base {
      static {
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "",
      "written_on(2i)": "",
      "written_on(3i)": "",
      "written_on(4i)": "",
      "written_on(5i)": "",
    });
    expect((topic as any).written_on).toBeNull();
  });

  it("multiparameter attributes on time with old date", () => {
    class Topic extends Base {
      static {
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "1850",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "0",
    });
    const dt = (topic as any).written_on as Temporal.PlainDateTime;
    expect(dt).toBeInstanceOf(Temporal.PlainDateTime);
    expect(dt.year).toBe(1850);
  });

  it("multiparameter attributes on time will raise on big time if missing date parts", () => {
    class Topic extends Base {
      static {
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    // Rails: time parts without date context → Time.new(nil,nil,nil,16,24) raises ArgumentError,
    // collected into MultiparameterAssignmentErrors.
    expect(() =>
      topic.assignAttributes({ "written_on(4i)": "16", "written_on(5i)": "24" }),
    ).toThrow(MultiparameterAssignmentErrors);
  });

  it("multiparameter attributes on time with raise on small time if missing date parts", () => {
    class Topic extends Base {
      static {
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    expect(() => topic.assignAttributes({ "written_on(4i)": "1", "written_on(5i)": "2" })).toThrow(
      MultiparameterAssignmentErrors,
    );
  });

  it("multiparameter attributes on time will ignore hour if missing", () => {
    class Topic extends Base {
      static {
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(5i)": "24",
    });
    const dt = (topic as any).written_on as Temporal.PlainDateTime;
    expect(dt.year).toBe(2004);
    expect(dt.hour).toBe(0);
  });

  it("multiparameter attributes on time will ignore hour if blank", () => {
    class Topic extends Base {
      static {
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "",
      "written_on(5i)": "24",
    });
    const dt = (topic as any).written_on as Temporal.PlainDateTime;
    expect(dt.year).toBe(2004);
    expect(dt.hour).toBe(0);
  });

  it("multiparameter attributes on time will ignore date if empty", () => {
    class Topic extends Base {
      static {
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "",
      "written_on(2i)": "",
      "written_on(3i)": "",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
    });
    expect((topic as any).written_on).toBeNull();
  });

  it("multiparameter attributes on time with seconds will ignore date if empty", () => {
    class Topic extends Base {
      static {
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "",
      "written_on(2i)": "",
      "written_on(3i)": "",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "30",
    });
    expect((topic as any).written_on).toBeNull();
  });

  it.skip("multiparameter attributes on time with utc", () => {
    // UTC timezone handling requires global timezone configuration.
  });

  it.skip("multiparameter attributes on time with time zone aware attributes", () => {
    // Requires time_zone_aware_attributes configuration.
  });

  it.skip("multiparameter attributes on time with time zone aware attributes and invalid time params", () => {
    // Requires time_zone_aware_attributes configuration.
  });

  it.skip("multiparameter attributes on time with time zone aware attributes false", () => {
    // Requires time_zone_aware_attributes configuration.
  });

  it.skip("multiparameter attributes on time with skip time zone conversion for attributes", () => {
    // Requires skip_time_zone_conversion_for_attributes configuration.
  });

  it.skip("multiparameter attributes on time only column with time zone aware attributes does not do time zone conversion", () => {
    // Requires time_zone_aware_attributes configuration.
  });

  it("multiparameter attributes setting time attribute", () => {
    class Topic extends Base {
      static {
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    // Rails: topic.attributes = {...} calls assign_attributes
    (topic as any).attributes = {
      "written_on(4i)": "13",
      "written_on(5i)": "30",
      "written_on(1i)": "2004",
      "written_on(2i)": "1",
      "written_on(3i)": "1",
    };
    const dt = (topic as any).written_on as Temporal.PlainDateTime;
    expect(dt.year).toBe(2004);
    expect(dt.hour).toBe(13);
    expect(dt.minute).toBe(30);
  });

  it("multiparameter attributes on time with empty seconds", () => {
    class Topic extends Base {
      static {
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "",
    });
    const dt = (topic as any).written_on as Temporal.PlainDateTime;
    expect(dt.year).toBe(2004);
    expect(dt.hour).toBe(16);
    expect(dt.second).toBe(0);
  });

  it("multiparameter attributes setting date attribute", () => {
    class Topic extends Base {
      static {
        this.attribute("last_read", "date");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    (topic as any).attributes = {
      "last_read(1i)": "2004",
      "last_read(2i)": "6",
      "last_read(3i)": "24",
    };
    const d = (topic as any).last_read as Temporal.PlainDate;
    expect(d.year).toBe(2004);
    expect(d.month).toBe(6);
    expect(d.day).toBe(24);
  });

  it("create with multiparameter attributes setting date attribute", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("last_read", "date");
        this.adapter = adapter;
      }
    }
    // Rails: Topic.new(attrs) calls assign_attributes internally
    const topic = new Topic({
      title: "test",
      "last_read(1i)": "2004",
      "last_read(2i)": "6",
      "last_read(3i)": "24",
    });
    const d = (topic as any).last_read as Temporal.PlainDate;
    expect(d.year).toBe(2004);
    expect(d.month).toBe(6);
    expect(d.day).toBe(24);
  });

  it("multiparameter attributes setting date and time attribute", () => {
    class Topic extends Base {
      static {
        this.attribute("last_read", "date");
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }
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
    const d = (topic as any).last_read as Temporal.PlainDate;
    expect(d.year).toBe(2004);
    const dt = (topic as any).written_on as Temporal.PlainDateTime;
    expect(dt.hour).toBe(16);
  });

  it("create with multiparameter attributes setting date and time attribute", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }
    const topic = new Topic({
      title: "test",
      "written_on(1i)": "2004",
      "written_on(2i)": "6",
      "written_on(3i)": "24",
      "written_on(4i)": "16",
      "written_on(5i)": "24",
      "written_on(6i)": "0",
    });
    const dt = (topic as any).written_on as Temporal.PlainDateTime;
    expect(dt.year).toBe(2004);
    expect(dt.hour).toBe(16);
  });

  it("multiparameter attributes setting time but not date on date field", () => {
    class Topic extends Base {
      static {
        this.attribute("last_read", "date");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "",
      "last_read(2i)": "",
      "last_read(3i)": "",
    });
    expect((topic as any).last_read).toBeNull();
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
        this.adapter = adapter;
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
        this.adapter = adapter;
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
        this.adapter = adapter;
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
        this.adapter = adapter;
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
        this.adapter = adapter;
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
    class Topic extends Base {
      static {
        this.attribute("last_read", "date");
        this.adapter = adapter;
      }
    }
    const topic = new Topic();
    topic.assignAttributes({
      "last_read(1i)": "2004",
      "last_read(2i)": "6",
      "last_read(3i)": "24",
    });
    const d = (topic as any).last_read as Temporal.PlainDate;
    expect(d.year).toBe(2004);
    expect(d.month).toBe(6);
    expect(d.day).toBe(24);
  });
});
