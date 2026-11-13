import { describe, expect, it } from "vitest";
import { fixturesAll } from "../test-helper.js";
import { ActiveRecord, type Base } from "@blazetrails/activerecord";
import type { RichText } from "../../lib/rich-text.js";
import { EncryptedMessage } from "../dummy/app/models/encrypted-message.js";
import { Message } from "../dummy/app/models/message.js";

type RichTextRecord = Base & { [attributeName: string]: unknown };

async function richText(model: RichTextRecord, attributeName: string): Promise<RichText> {
  await model[`richText${attributeName[0].toUpperCase()}${attributeName.slice(1)}`];
  return model[attributeName] as RichText;
}

async function assertEncryptedRichTextAttribute(
  model: RichTextRecord,
  attributeName: string,
  expectedValue: string,
): Promise<void> {
  expect((await richText(model, attributeName)).ciphertextFor("body")).not.toEqual(expectedValue);
  await model.reload();
  expect((await richText(model, attributeName)).body!.toHtml()).toEqual(expectedValue);
}

async function assertNotEncryptedRichTextAttribute(
  model: RichTextRecord,
  attributeName: string,
  expectedValue: string,
): Promise<void> {
  expect((await richText(model, attributeName)).ciphertextFor("body")).toEqual(expectedValue);
  await model.reload();
  expect((await richText(model, attributeName)).body!.toHtml()).toEqual(expectedValue);
}

describe("ActionText::ModelEncryptionTest", () => {
  fixturesAll();

  it("encrypt content based on :encrypted option at declaration time", async () => {
    const encryptedMessage = (await EncryptedMessage.createBang({
      subject: "Greetings",
      content: "Hey there",
    })) as unknown as RichTextRecord;
    await assertEncryptedRichTextAttribute(encryptedMessage, "content", "Hey there");

    const clearMessage = (await Message.createBang({
      subject: "Greetings",
      content: "Hey there",
    })) as unknown as RichTextRecord;
    await assertNotEncryptedRichTextAttribute(clearMessage, "content", "Hey there");
  });

  it("include rich text attributes when encrypting the model", async () => {
    const content = "<p>the space force is here, we are safe now!</p>";

    const message = (await ActiveRecord.Encryption.withoutEncryption(() =>
      EncryptedMessage.createBang({ subject: "Greetings", content: content }),
    )) as unknown as RichTextRecord;

    await message.encrypt();

    await assertEncryptedRichTextAttribute(message, "content", content);
  });
});
