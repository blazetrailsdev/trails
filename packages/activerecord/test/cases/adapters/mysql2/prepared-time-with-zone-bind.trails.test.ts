import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TimeWithZone, TimeZone } from "@blazetrails/activesupport";
import type { Time } from "@blazetrails/date";
import { Base } from "../../../../lib/index.js";
import { fixtures } from "../../../support/use-fixtures.js";
import { currentAdapter } from "../../../support/adapter-helper.js";
import { Topic } from "../../../models/topic.js";

describe.runIf(currentAdapter("Mysql2Adapter"))(
  "Mysql2Adapter prepared TimeWithZone and Date binds (trails)",
  () => {
    const { topics } = fixtures(["topics"]);

    let adapter: Awaited<ReturnType<typeof Base.leaseConnection>>;
    let preparedStatements: unknown;
    beforeEach(async () => {
      adapter = await Base.leaseConnection();
      preparedStatements = adapter.preparedStatements;
      adapter.preparedStatements = true;
    });
    afterEach(() => {
      adapter.preparedStatements = preparedStatements;
    });

    it("round-trips a TimeWithZone bind through a prepared statement", async () => {
      const topic = await topics("first");
      const writtenOn = new TimeWithZone(
        (topic.written_on as Time).getutc(),
        TimeZone.find("Tokyo")!,
      );
      expect(writtenOn).toBeInstanceOf(TimeWithZone);
      expect(await Topic.where({ written_on: writtenOn }).pluck("id")).toEqual([topic.id]);
    });

    it("round-trips a Date bind through a prepared statement", async () => {
      const topic = await topics("first");
      const lastRead = Temporal.PlainDate.from("2004-04-15");
      expect(await Topic.where({ last_read: lastRead }).pluck("id")).toContain(topic.id);
    });
  },
);
