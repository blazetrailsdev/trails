import { describe, expect, it } from "vitest";
import { fixturesAll } from "../test-helper.js";
import { StrictLoadingViolationError } from "@blazetrails/activerecord";
import { assertNothingRaised } from "@blazetrails/activesupport/testing/assertions";
import type { RichText } from "../../lib/rich-text.js";
import { Message } from "../dummy/app/models/message.js";

type HasRichText = { hasRichText(name: string, options?: object): void };

class MessageWithStrictLoading extends Message {
  static {
    this.strictLoadingByDefault = true;

    (this as unknown as HasRichText).hasRichText("strict_loading_content");
  }
}

class MessageWithFooter extends MessageWithStrictLoading {
  static {
    (this as unknown as HasRichText).hasRichText("footer", { strictLoading: false });
  }
}

type StrictLoadingMessage = MessageWithStrictLoading & {
  strict_loading_content: RichText;
  footer: RichText;
  richTextStrictLoadingContent: Promise<RichText | null>;
  richTextFooter: Promise<RichText | null>;
};

type StrictLoadingMessageClass = {
  createBang(attributes?: object): Promise<StrictLoadingMessage>;
  all(): { toArray(): Promise<StrictLoadingMessage[]> };
  withRichTextStrictLoadingContent(): {
    toArray(): Promise<StrictLoadingMessage[]>;
    all(): { toArray(): Promise<StrictLoadingMessage[]> };
  };
};

const MessagesWithStrictLoading = MessageWithStrictLoading as unknown as StrictLoadingMessageClass;
const MessagesWithFooter = MessageWithFooter as unknown as StrictLoadingMessageClass;

describe("ActionText::StrictLoadingTest", () => {
  fixturesAll();

  it("has_rich_text reads strict_loading: option from strict_loading_by_default", async () => {
    await MessagesWithStrictLoading.createBang({ strict_loading_content: "ignored" });

    await expect(
      (async () => {
        for (const message of await MessagesWithStrictLoading.all().toArray()) {
          await message.richTextStrictLoadingContent;
        }
      })(),
    ).rejects.toThrow(StrictLoadingViolationError);

    for (const message of await MessagesWithStrictLoading.withRichTextStrictLoadingContent().toArray()) {
      void message.strict_loading_content;
    }
  });

  it("pre-loading the association does not raise a StrictLoadingViolationError", async () => {
    await MessagesWithStrictLoading.createBang({ strict_loading_content: "ignored" });

    const records = await MessagesWithStrictLoading.withRichTextStrictLoadingContent()
      .all()
      .toArray();

    await assertNothingRaised(() => records.map((record) => record.strict_loading_content));
  });

  it("has_rich_text accepts strict_loading: overrides", async () => {
    await MessagesWithFooter.createBang({ footer: "ignored" });

    const records = await MessagesWithFooter.all().toArray();

    await assertNothingRaised(async () => {
      for (const record of records) await record.richTextFooter;
      return records.map((record) => record.footer);
    });
  });
});
