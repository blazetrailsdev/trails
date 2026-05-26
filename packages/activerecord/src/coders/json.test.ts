import { describe, it, expect, beforeAll } from "vitest";
import { Base, serialize } from "../index.js";
import { Topic } from "../test-helpers/models/topic.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { useFixtures } from "../test-helpers/use-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({ topics: TEST_SCHEMA.topics });
  await SerializedTopic.loadSchema();
});

class SerializedTopic extends Topic {
  static override _tableName = "topics";
}
serialize(SerializedTopic, "content");

const { topics } = useFixtures(
  {
    topics: [
      SerializedTopic,
      {
        empty_content: { title: "Empty Content", content: "" },
        nil_content: { title: "Nil Content", content: null },
      },
    ],
  },
  () => Base.adapter,
);

describe("JSONTest", () => {
  it("returns nil if empty string given", async () => {
    const reloaded = await SerializedTopic.find(topics("empty_content").id);
    expect(reloaded.content).toBeNull();
  });

  it("returns nil if nil given", async () => {
    const reloaded = await SerializedTopic.find(topics("nil_content").id);
    expect(reloaded.content).toBeNull();
  });
});
