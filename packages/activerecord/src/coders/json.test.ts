import { describe, it, expect } from "vitest";
import { serialize } from "../index.js";
import { Topic } from "../test-helpers/models/topic.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";

class SerializedTopic extends Topic {
  static override _tableName = "topics";
}
serialize(SerializedTopic, "content");

const { topics } = useHandlerFixtures({
  topics: [
    SerializedTopic,
    {
      empty_content: { title: "Empty Content", content: "" },
      nil_content: { title: "Nil Content", content: null },
    },
  ],
});

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
