import { describe, expect, it } from "vitest";
import { fixturesAll } from "../test-helper.js";
import type { Message } from "../dummy/app/models/message.js";
import type { Review } from "../dummy/app/models/review.js";
import type { RichText } from "../../lib/rich-text.js";

describe("ActionText::FixtureSetTest", () => {
  const { messages, reviews } = fixturesAll() as never as {
    messages: (name: string) => Promise<Message>;
    reviews: (name: string) => Promise<Review & { content: RichText }>;
  };

  it("action text attachment", async () => {
    const message = await messages("hello_world");
    const review = await reviews("hello_world");
    await (review as unknown as { richTextContent: Promise<unknown> }).richTextContent;

    const attachments = await review.content.body!.attachments();

    expect(attachments.map((attachment) => attachment!.attachable)).toContainEqual(message);
  });
});
