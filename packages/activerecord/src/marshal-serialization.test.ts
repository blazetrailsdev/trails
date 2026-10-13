import { readFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { File as RubyFile, Marshal } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { TEST_ROOT } from "./config.js";
import { formatVersion, setFormatVersion } from "./marshalling.js";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";
import "./test-helpers/models/reply.js";

describe("MarshalSerializationTest", () => {
  fixtures(["topics"]);

  let previousFormatVersion: 6.1 | 7.1;

  beforeEach(() => {
    previousFormatVersion = formatVersion();
  });

  afterEach(() => {
    setFormatVersion(previousFormatVersion);
  });

  async function marshalFixture(fileName: string): Promise<string> {
    return readFile(await marshalFixturePath(fileName), "latin1");
  }

  async function marshalFixturePath(fileName: string): Promise<string> {
    return RubyFile.expandPath(
      `support/marshal_compatibility_fixtures/${(await Base.leaseConnection()).adapterName}/${fileName}.dump`,
      TEST_ROOT,
    );
  }

  it.skip("deserializing rails 6 1 marshal basic", async () => {
    // BLOCKED: activerecord-load-rails-written-marshal-fixtures
    const topic = Marshal.load(await marshalFixture("rails_6_1_topic")) as Topic;

    expect(topic.isNewRecord()).toBeFalsy();
    expect(topic.id).toBe(1);
    expect(topic.title).toBe("The First Topic");
    expect(topic.content).toBe("Have a nice day");
  });

  it.skip("deserializing rails 6 1 marshal with loaded association cache", async () => {
    // BLOCKED: activerecord-load-rails-written-marshal-fixtures
    const topic = Marshal.load(await marshalFixture("rails_6_1_topic_associations")) as Topic;

    expect(topic.isNewRecord()).toBeFalsy();
    expect(topic.id).toBe(1);
    expect(topic.title).toBe("The First Topic");
    expect(topic.content).toBe("Have a nice day");
    expect(topic.association("replies").isLoaded()).toBeTruthy();
    expect((await topic.replies.first())!.association("topic").isLoaded()).toBeTruthy();
  });

  it.skip("deserializing rails 7 1 marshal basic", async () => {
    // BLOCKED: activerecord-load-rails-written-marshal-fixtures
    const topic = Marshal.load(await marshalFixture("rails_7_1_topic")) as Topic;

    expect(topic.isNewRecord()).toBeFalsy();
    expect(topic.id).toBe(1);
    expect(topic.title).toBe("The First Topic");
    expect(topic.content).toBe("Have a nice day");
  });

  it.skip("deserializing rails 7 1 marshal with loaded association cache", async () => {
    // BLOCKED: activerecord-load-rails-written-marshal-fixtures
    const topic = Marshal.load(await marshalFixture("rails_7_1_topic_associations")) as Topic;

    expect(topic.isNewRecord()).toBeFalsy();
    expect(topic.id).toBe(1);
    expect(topic.title).toBe("The First Topic");
    expect(topic.content).toBe("Have a nice day");
    expect(topic.association("replies").isLoaded()).toBeTruthy();
    expect((await topic.replies.first())!.association("topic").isLoaded()).toBeTruthy();
    expect(await (await topic.replies.first())!.topic).toBe(topic);
  });

  it("rails 6 1 rountrip", async () => {
    let topic = await Topic.find(1);
    await topic.replies;
    topic = Marshal.load(Marshal.dump(topic)) as Topic;

    expect(topic.isNewRecord()).toBeFalsy();
    expect(topic.id).toBe(1);
    expect(topic.title).toBe("The First Topic");
    expect(topic.content).toBe("Have a nice day");
    expect(topic.association("replies").isLoaded()).toBeTruthy();
  });

  it("rails 7 1 rountrip", async () => {
    setFormatVersion(7.1);

    let topic = await Topic.find(1);
    for (const reply of await topic.replies) await reply.topic;
    expect(await topic.replies.size()).not.toBe(0);
    for (const reply of await topic.replies) {
      expect(await reply.topic).toBe(topic);
    }

    topic.association("openReplies");
    expect(topic.isAssociationCached("openReplies")).toBe(true);
    expect(topic.association("openReplies").isLoaded()).toBeFalsy();

    topic = Marshal.load(Marshal.dump(topic)) as Topic;

    expect(topic.isNewRecord()).toBeFalsy();
    expect(topic.id).toBe(1);
    expect(topic.title).toBe("The First Topic");
    expect(topic.content).toBe("Have a nice day");
    expect(topic.association("replies").isLoaded()).toBeTruthy();

    expect(topic.association("openReplies").isLoaded()).toBeFalsy();

    expect(await topic.replies.size()).not.toBe(0);
    for (const reply of await topic.replies) {
      expect(await reply.topic).toBe(topic);
    }
  });
});
