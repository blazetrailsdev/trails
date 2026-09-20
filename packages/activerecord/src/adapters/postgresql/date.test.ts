import { describe, it, expect } from "vitest";
import { Temporal, Time } from "@blazetrails/date";
import { describeIfPg } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Topic } from "../../test-helpers/models/topic.js";

function infinite(value: unknown): number | null {
  if (value === Infinity) return 1;
  if (value === -Infinity) return -1;
  return null;
}

describeIfPg("PostgreSQLAdapter", () => {
  fixtures([]);

  describe("PostgresqlDateTest", () => {
    it("load infinity and beyond", async () => {
      let topic = (await Topic.findBySql("SELECT 'infinity'::date AS last_read"))[0];
      expect(infinite(topic.last_read)).toBeTruthy();
      expect(topic.last_read as unknown as number).toBeGreaterThan(0);

      topic = (await Topic.findBySql("SELECT '-infinity'::date AS last_read"))[0];
      expect(infinite(topic.last_read)).toBeTruthy();
      expect(topic.last_read as unknown as number).toBeLessThan(0);
    });

    it("save infinity and beyond", async () => {
      let topic = await Topic.createBang({ last_read: 1.0 / 0.0 });
      expect(topic.last_read).toEqual(1.0 / 0.0);

      topic = await Topic.createBang({ last_read: -1.0 / 0.0 });
      expect(topic.last_read).toEqual(-1.0 / 0.0);
    });

    it("bc date", async () => {
      const date = new Temporal.PlainDate(0, 1, 1).subtract({ weeks: 1 });
      const topic = await Topic.createBang({ last_read: date });
      expect((await Topic.find(topic.id)).last_read).toEqual(date);
    });

    it("bc date leap year", async () => {
      const date = Time.utc(-4, 2, 29).toDate();
      const topic = await Topic.createBang({ last_read: date });
      expect((await Topic.find(topic.id)).last_read).toEqual(date);
    });

    it("bc date year zero", async () => {
      const date = Time.utc(0, 4, 7).toDate();
      const topic = await Topic.createBang({ last_read: date });
      expect((await Topic.find(topic.id)).last_read).toEqual(date);
    });
  });
});
