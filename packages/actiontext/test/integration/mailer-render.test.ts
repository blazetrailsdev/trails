import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Base as ActionMailerBase } from "@blazetrails/actionmailer";
import { TestCase as ActionMailerTestCase } from "@blazetrails/actionmailer/test-case";
import { block } from "@blazetrails/ruby-compat";
import { createFileBlob, fixturesAll } from "../test-helper.js";
import { Content } from "../../lib/content.js";
import { MessagesMailer } from "../dummy/app/mailers/messages-mailer.js";
import { Message } from "../dummy/app/models/message.js";

class MailerRenderTest extends ActionMailerTestCase {
  usesDefaultUrlOptions(): void {}
}

type Notifier = { notification(): { deliverNow(): Promise<unknown> } };

describe("ActionText::MailerRenderTest", () => {
  fixturesAll();
  let t: MailerRenderTest & {
    assertSelect(...args: unknown[]): unknown;
    assertSelectEmail(...args: unknown[]): unknown;
  };

  beforeEach(async () => {
    t = new MailerRenderTest("usesDefaultUrlOptions") as typeof t;
    await t.beforeSetup();
  });

  afterEach(async () => {
    await t.afterTeardown();
  });

  it("uses default_url_options", async () => {
    const originalDefaultUrlOptions = (
      ActionMailerBase as unknown as { defaultUrlOptions: unknown }
    ).defaultUrlOptions;
    try {
      (ActionMailerBase as unknown as { defaultUrlOptions: unknown }).defaultUrlOptions = {
        host: "hoost",
      };

      const blob = await createFileBlob({ filename: "racecar.jpg", contentType: "image/jpeg" });
      const message = new Message();
      await message.setAttributes({ content: await (await Content.new()).appendAttachables(blob) });

      await (MessagesMailer.with({ recipient: "test", message: message }) as unknown as Notifier)
        .notification()
        .deliverNow();

      t.assertSelectEmail(
        {},
        block(() => {
          t.assertSelect(
            "#message-content img",
            block((imgs: Array<{ get(k: string): string }>) => {
              for (const img of imgs) expect(img.get("src")).toMatch(/\/\/hoost\//);
            }),
          );
        }),
      );
    } finally {
      (ActionMailerBase as unknown as { defaultUrlOptions: unknown }).defaultUrlOptions =
        originalDefaultUrlOptions;
    }
  });
});
