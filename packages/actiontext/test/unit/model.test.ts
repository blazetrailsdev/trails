import { describe, expect, it } from "vitest";
import { createFileBlob, fixturesAll } from "../test-helper.js";
import { ActiveStorage } from "@blazetrails/activestorage";
import {
  assertNoQueries,
  assertQueriesCount,
} from "@blazetrails/activerecord/testing/query-assertions";
import {
  assertDifference,
  assertNoDifference,
  assertNothingRaised,
} from "@blazetrails/activesupport/testing/assertions";
import { RemoteImage } from "../../lib/attachables/remote-image.js";
import { Content } from "../../lib/content.js";
import { RichText } from "../../lib/rich-text.js";
import { Message } from "../dummy/app/models/message.js";
import { MessageWithoutBlanks } from "../dummy/app/models/message-without-blanks.js";
import { MessageWithoutBlanksWithContentValidation } from "../dummy/app/models/message-without-blanks-with-content-validation.js";

type RichTextMessage = Message & {
  content: RichText;
  body: RichText;
  richTextContent: Promise<RichText | null>;
  review: Promise<{ id: unknown; content: RichText; reload(): Promise<unknown> }>;
  isContent(): Promise<boolean>;
};

type RichTextMessageClass = {
  new (attributes?: object): RichTextMessage;
  create(attributes?: object): Promise<RichTextMessage>;
  createBang(attributes?: object): Promise<RichTextMessage>;
  withRichTextContent(): { last(): Promise<RichTextMessage> };
  withAllRichText(): { toArray(): Promise<RichTextMessage[]> };
};

const Messages = Message as unknown as RichTextMessageClass;
const MessagesWithoutBlanks = MessageWithoutBlanks as unknown as RichTextMessageClass;
const MessagesWithoutBlanksWithContentValidation =
  MessageWithoutBlanksWithContentValidation as unknown as RichTextMessageClass;

const richTextCount = () => RichText.count();

describe("ActionText::ModelTest", () => {
  fixturesAll();

  it("html conversion", async () => {
    const message = new Messages({ subject: "Greetings", content: "<h1>Hello world</h1>" });
    expect(`${await message.content.toString()}`).toEqual(
      `<div class="trix-content">\n  <h1>Hello world</h1>\n</div>\n`,
    );
  });

  it("plain text conversion", async () => {
    const message = new Messages({ subject: "Greetings", content: "<h1>Hello world</h1>" });
    expect(await message.content.toPlainText()).toEqual("Hello world");
  });

  it("without content", async () => {
    await assertDifference(new Map([[richTextCount, 0]]), null, async () => {
      const message = await Messages.createBang({ subject: "Greetings" });
      await message.richTextContent;
      expect(message.content.isNil()).toBeTruthy();
      expect(message.content.isBlank()).toBeTruthy();
      expect(message.content.isEmpty()).toBeTruthy();
      expect(await message.isContent()).toBeFalsy();
      expect(message.content.isPresent()).toBeFalsy();
    });
  });

  it("with blank content", async () => {
    await assertDifference(new Map([[richTextCount, 1]]), null, async () => {
      const message = await Messages.createBang({ subject: "Greetings", content: "" });
      await message.content.toPlainText();
      expect(message.content.isNil()).toBeFalsy();
      expect(message.content.isBlank()).toBeTruthy();
      expect(message.content.isEmpty()).toBeTruthy();
      expect(await message.isContent()).toBeFalsy();
      expect(message.content.isPresent()).toBeFalsy();
    });
  });

  it("embed extraction", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg", contentType: "image/jpeg" });
    const message = await Messages.createBang({
      subject: "Greetings",
      content: await new Content("Hello world").appendAttachables(blob),
    });
    const embeds = (await (message.content as unknown as { embeds: { blobs: unknown } }).embeds
      .blobs) as Array<{ filename: { toString(): string } }>;
    expect(embeds[0].filename.toString()).toEqual("racecar.jpg");
  });

  it("embed extraction only extracts file attachments", async () => {
    const remoteImageHtml =
      '<action-text-attachment content-type="image" url="http://example.com/cat.jpg"></action-text-attachment>';
    const blob = await createFileBlob({ filename: "racecar.jpg", contentType: "image/jpeg" });
    const content = await new Content(remoteImageHtml).appendAttachables(blob);
    const message = await Messages.createBang({ subject: "Greetings", content: content });
    expect(
      (await message.content.body!.attachables()).map((attachable) => attachable!.constructor),
    ).toEqual([RemoteImage, ActiveStorage.Blob]);
    const embeds = (await (message.content as unknown as { embeds: { attachments: unknown } })
      .embeds.attachments) as object[];
    expect(embeds.map((embed) => embed.constructor)).toEqual([ActiveStorage.Attachment]);
  });

  it("embed extraction deduplicates file attachments", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg", contentType: "image/jpeg" });
    const content = await new Content("Hello world").appendAttachables([blob, blob]);

    await assertNothingRaised(async () => {
      await Messages.createBang({ subject: "Greetings", content: content });
    });
  });

  it("saving content", async () => {
    const message = await Messages.createBang({
      subject: "Greetings",
      content: "<h1>Hello world</h1>",
    });
    expect(await message.content.toPlainText()).toEqual("Hello world");
  });

  it("duplicating content", async () => {
    const message = await Messages.createBang({ subject: "Greetings", content: "<b>Hello!</b>" });
    const otherMessage = await Messages.createBang({
      subject: "Greetings",
      content: message.content,
    });

    expect(otherMessage.content.body!.toHtml()).toEqual(message.content.body!.toHtml());
  });

  it("saving body", async () => {
    const message = await Messages.create({ subject: "Greetings", body: "<h1>Hello world</h1>" });
    expect(await message.body.toPlainText()).toEqual("Hello world");
  });

  it("saving content via nested attributes", async () => {
    const message = await Messages.createBang({
      subject: "Greetings",
      content: "<h1>Hello world</h1>",
      reviewAttributes: { author_name: "Marcia", content: "Nice work!" },
    });
    expect(await (await message.review).content.toPlainText()).toEqual("Nice work!");
  });

  it("updating content via nested attributes", async () => {
    const message = await Messages.createBang({
      subject: "Greetings",
      content: "<h1>Hello world</h1>",
      reviewAttributes: { author_name: "Marcia", content: "Nice work!" },
    });

    await message.updateBang({
      reviewAttributes: { id: (await message.review).id, content: "Great work!" },
    });
    const review = await message.review;
    await review.reload();
    await (review as unknown as { richTextContent: Promise<unknown> }).richTextContent;
    expect(await review.content.toPlainText()).toEqual("Great work!");
  });

  it("building content lazily on existing record", async () => {
    const message = await Messages.createBang({ subject: "Greetings" });

    await assertNoDifference(richTextCount, null, async () => {
      await message.richTextContent;
      expect(message.content).toBeInstanceOf(RichText);
    });
  });

  it("eager loading", async () => {
    await Messages.createBang({ subject: "Subject", content: "<h1>Content</h1>" });

    const message = await assertQueriesCount(2, false, () => Messages.withRichTextContent().last());
    await assertNoQueries(false, async () => {
      expect(await message.content.toPlainText()).toEqual("Content");
    });
  });

  it("eager loading all rich text", async () => {
    for (let i = 0; i < 2; i++) {
      await Messages.createBang({
        subject: "Subject",
        content: "<h1>Content</h1>",
        body: "<h2>Body</h2>",
      });
    }

    const message = await assertQueriesCount(3, false, async () => {
      return (await Messages.withAllRichText().toArray()).at(-1)!;
    });

    await assertNoQueries(false, async () => {
      expect(await message.content.toPlainText()).toEqual("Content");
      expect(await message.body.toPlainText()).toEqual("Body");
    });
  });

  it("with blank content and store_if_blank: false", async () => {
    await assertDifference(new Map([[richTextCount, 0]]), null, async () => {
      const message = await MessagesWithoutBlanks.createBang({
        subject: "Greetings",
        content: "",
      });
      expect(message.content.isNil()).toBeTruthy();
      expect(message.content.isBlank()).toBeTruthy();
      expect(message.content.isEmpty()).toBeTruthy();
      expect(await message.isContent()).toBeFalsy();
      expect(message.content.isPresent()).toBeFalsy();
    });
  });

  it("if allowing blanks, updates rich text record on edit", async () => {
    const message = await Messages.createBang({ subject: "Greetings", content: "content" });
    await assertDifference(new Map([[richTextCount, 0]]), null, async () => {
      await message.update({ content: "" });
    });
  });

  it("if disallowing blanks, deletes rich text record on edit", async () => {
    const message = await MessagesWithoutBlanks.createBang({
      subject: "Greetings",
      content: "content",
    });
    await assertDifference(new Map([[richTextCount, -1]]), null, async () => {
      await message.update({ content: "" });
    });
  });

  it("if disallowing blanks, can still validate presence", async () => {
    const message1 = new MessagesWithoutBlanksWithContentValidation({
      subject: "Greetings",
      content: "",
    });
    await message1.content.toPlainText();
    expect(await message1.isValid()).toBeFalsy();
    message1.content = "content" as never;
    await message1.content.toPlainText();
    expect(await message1.isValid()).toBeTruthy();

    const message2 = new MessagesWithoutBlanksWithContentValidation({
      subject: "Greetings",
      content: "content",
    });
    await message2.content.toPlainText();
    expect(await message2.isValid()).toBeTruthy();
    message2.content = "" as never;
    await message2.content.toPlainText();
    expect(await message2.isValid()).toBeFalsy();
  });
});
