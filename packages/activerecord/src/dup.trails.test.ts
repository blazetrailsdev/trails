import { describe, it, expect } from "vitest";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";

describe("DupTrailsTest", () => {
  fixtures(["topics"]);

  it("dup runs after_initialize against the duped attributes", async () => {
    const topic = await Topic.find(3);
    expect(topic.author_email_address).toBeFalsy();
    const duped = topic.dup();
    expect(duped.title).toBe(topic.title);
    expect(duped.author_email_address).toBeFalsy();
  });
});
