import { beforeAll, describe, expect, it } from "vitest";
import "./test-helper.js";
import { Base, Reflection } from "@blazetrails/activerecord";
import { ActiveRecordExtensions, ReflectionExtension } from "@blazetrails/activestorage/reflection";
import { ActiveStorage, Model } from "@blazetrails/activestorage";
import { include, prepend, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";
import { ActionText } from "../lib/action-text.js";
import { Attribute } from "../lib/attribute.js";
import { Content } from "../lib/content.js";
import { Message } from "./dummy/app/models/message.js";

type RichTextMessage = Message & {
  content: import("../lib/rich-text.js").RichText;
  isContent(): Promise<boolean>;
};

let RichText: typeof import("../lib/rich-text.js").RichText;

beforeAll(async () => {
  Object.defineProperty(ActionText, "tableNamePrefix", {
    value: "action_text_",
    configurable: true,
  });
  Object.defineProperty(ActiveStorage, "tableNamePrefix", {
    value: "active_storage_",
    configurable: true,
  });
  include(Base, Model);
  include(Base, ActiveRecordExtensions);
  prepend(rbObjSingletonClass(Reflection), ReflectionExtension);
  await import("@blazetrails/activestorage/blob");
  (Trails.configuration as unknown as { activeStorage: unknown }).activeStorage = {
    service: "local",
  };
  include(Base, Attribute);
  ({ RichText } = await import("../lib/rich-text.js"));
  (Message as unknown as { hasRichText(name: string): void }).hasRichText("content");
  await Message.loadSchema();
  await RichText.loadSchema();
  await ActiveStorage.Blob!.loadSchema();
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

  it("lists rich text association names", () => {
    expect(
      (Message as unknown as { richTextAssociationNames(): string[] }).richTextAssociationNames(),
    ).toEqual(["richTextContent"]);
  });
});
