import { beforeAll, describe, expect, it } from "vitest";
import "./test-helper.js";
import type { Base } from "@blazetrails/activerecord";
import { ActiveStorage } from "@blazetrails/activestorage";
import { StringIO } from "@blazetrails/ruby-compat";
import { Attachment } from "../lib/attachment.js";
import { Content } from "../lib/content.js";
import { Message } from "./dummy/app/models/message.js";
import { MessageWithoutBlanks } from "./dummy/app/models/message-without-blanks.js";

type RichTextMessage = Message & {
  content: import("../lib/rich-text.js").RichText;
  isContent(): Promise<boolean>;
};

let RichText: typeof import("../lib/rich-text.js").RichText;

beforeAll(async () => {
  ({ RichText } = await import("../lib/rich-text.js"));
  await Message.loadSchema();
  await RichText.loadSchema();
  await ActiveStorage.Blob!.loadSchema();
  await (ActiveStorage.Attachment as unknown as typeof Base).loadSchema();
});

describe("ActionText::Serialization (trails)", () => {
  it("round-trips a body through Content.load and Content.dump", () => {
    const html = "<div>Hello <strong>world</strong></div>";
    const loaded = Content.load(html) as Content;
    expect(loaded).toBeInstanceOf(Content);
    expect(Content.dump(loaded)).toBe(html);
    expect(Content.dump(html)).toBe(html);
    expect(Content.dump(null)).toBeNull();
    expect(Content.load(null)).toBeNull();
    expect(loaded._dump()).toBe(html);
  });
});

describe("ActionText::Attribute (trails)", () => {
  it("builds the rich text lazily and saves it through the has_one", async () => {
    const message = new Message({ subject: "Greetings" }) as RichTextMessage;
    expect(message.content).toBeInstanceOf(RichText);
    expect(await message.isContent()).toBe(false);
    message.content = "<h1>Hello world</h1>" as never;
    expect(message.content.body).toBeInstanceOf(Content);
    expect(await message.isContent()).toBe(true);
    expect(await message.content.toPlainText()).toBe("Hello world");
    expect(await message.save()).toBe(true);

    const reloaded = (await Message.find(message.id)) as RichTextMessage;
    expect(() => reloaded.content).toThrow(/richTextContent is not loaded/);
    await (reloaded as unknown as { richTextContent: Promise<unknown> }).richTextContent;
    expect(reloaded.content.body!.toHtml()).toBe("<h1>Hello world</h1>");
  });

  it("answers blank? and present? from a loaded plain text", async () => {
    const message = new Message({ subject: "Greetings" }) as RichTextMessage;
    expect(message.content.isBlank()).toBe(true);
    message.content = "<h1>Hello</h1>" as never;
    expect(() => message.content.isPresent()).toThrow(/to_plain_text is not loaded/);
    await message.content.toPlainText();
    expect(message.content.isPresent()).toBe(true);
    expect(message.content.isEmpty()).toBe(false);
  });

  it("marks a loaded blank rich text for destruction when store_if_blank is false", async () => {
    const message = (await MessageWithoutBlanks.create({
      subject: "Greetings",
      content: "<p>content</p>",
    })) as unknown as RichTextMessage;
    message.content = "" as never;
    expect(message.content.markedForDestruction()).toBe(true);
    const before = await RichText.count();
    await message.save();
    expect(await RichText.count()).toBe(before - 1);
  });

  it("eager loads through the with_rich_text scopes and destroys with the record", async () => {
    const message = (await Message.create({
      subject: "Greetings",
      content: "<p>eager</p>",
    })) as unknown as RichTextMessage;
    const scoped = Message as unknown as {
      withRichTextContent(): { find(id: unknown): Promise<RichTextMessage> };
      withAllRichText(): { find(id: unknown): Promise<RichTextMessage> };
    };
    expect((await scoped.withRichTextContent().find(message.id)).content.body!.toHtml()).toBe(
      "<p>eager</p>",
    );
    expect((await scoped.withAllRichText().find(message.id)).content.body!.toHtml()).toBe(
      "<p>eager</p>",
    );
    const before = await RichText.count();
    await message.destroy();
    expect(await RichText.count()).toBe(before - 1);
  });

  it("extracts deduplicated blob embeds before save", async () => {
    const blob = await (
      ActiveStorage.Blob as unknown as {
        createAndUploadBang(options: object): Promise<{ id: unknown }>;
      }
    ).createAndUploadBang({
      io: new StringIO("racecar"),
      filename: "racecar.jpg",
      contentType: "image/jpeg",
    });
    const content = new Content(
      `Hello world${Attachment.fromAttachables([blob, blob])
        .map((attachment) => attachment.toHtml())
        .join("")}`,
    );
    const message = (await Message.create({
      subject: "Greetings",
      content: content,
    })) as unknown as RichTextMessage;
    const embeds = (await (message.content as unknown as { embeds: { blobs: unknown } }).embeds
      .blobs) as Array<{ id: unknown }>;
    expect(embeds.map((b) => b.id)).toEqual([blob.id]);
  });

  it("lists rich text association names", () => {
    expect(
      (Message as unknown as { richTextAssociationNames(): string[] }).richTextAssociationNames(),
    ).toEqual(["richTextContent", "richTextBody"]);
  });
});
