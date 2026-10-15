import { afterEach, beforeEach, describe, it } from "vitest";
import { ActiveRecordTestCase } from "../test-helpers/active-record-unit.js";
import { Topic } from "../test-helpers/fixtures/topic.js";
import {
  Notifications,
  assertEqual,
  type NotificationSubscriber,
} from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { FileSystemResolver } from "../template/resolver.js";

describe("PartialRenderingQueryTest", () => {
  class PartialRenderingQueryTest extends ActiveRecordTestCase {
    declare view: InstanceType<ReturnType<typeof Base.withEmptyTemplateCache>>;
    declare queries: string[];
    declare subscriber: NotificationSubscriber;

    override setup(): void {
      this.view = Base.withEmptyTemplateCache().withViewPaths(
        [
          new FileSystemResolver(
            File.expandPath("../test-helpers/fixtures", new URL(".", import.meta.url).pathname),
          ),
        ],
        {},
      );

      this.queries = [];

      this.subscriber = Notifications.subscribe(
        "sql.active_record",
        (
          _name: string,
          _start: unknown,
          _finish: unknown,
          _id: string,
          payload: Record<string, unknown>,
        ) => {
          if (!["SCHEMA", "TRANSACTION"].includes(payload.name as string)) {
            this.queries.push(payload.sql as string);
          }
        },
      );
    }

    override teardown(): void {
      Notifications.unsubscribe(this.subscriber);
    }
  }

  let tc: PartialRenderingQueryTest;

  beforeEach(async ({ task }) => {
    tc = new PartialRenderingQueryTest(task.name);
    tc.setup();
  });

  afterEach(() => {
    tc.teardown();
  });

  it("render with relation collection", async () => {
    await tc.view.render({ partial: "topics/topic", collection: Topic.all() });

    assertEqual(1, tc.queries.length);
    assertEqual('SELECT "topics".* FROM "topics"', tc.queries[0]);
  });
});
