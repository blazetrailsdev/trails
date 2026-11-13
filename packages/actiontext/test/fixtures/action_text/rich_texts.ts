import { FixtureSet } from "../../../lib/fixture-set.js";

export const richTexts = () => ({
  hello_alice_message_content: {
    record: "hello_alice (Message)",
    name: "content",
    body: `<p>Hello, ${FixtureSet.attachment("people", "alice")}</p>`,
  },
  hello_world_review_content: {
    record: "hello_world (Review)",
    name: "content",
    body: `<p>${FixtureSet.attachment("messages", "hello_world")} is great!</p>`,
  },
});
