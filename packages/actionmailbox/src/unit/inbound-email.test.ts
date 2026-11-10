import { describe, expect, it } from "vitest";
import type { Service } from "@blazetrails/activestorage/service";
import { assertNoDifference } from "@blazetrails/activesupport/testing/assertions";
import { stub } from "@blazetrails/activesupport/testing/method-call-assertions";
import { Mail } from "@blazetrails/mail";
import "../test-helpers/test-helper.js";
import { Blob } from "@blazetrails/activestorage/blob";
import { ActionMailbox } from "../action-mailbox.js";
import { InboundEmail } from "../inbound-email.js";
import { TestCase } from "../test-case.js";

class InboundEmailTest extends TestCase {
  inboundEmail(): void {}
}

describe("InboundEmailTest", () => {
  const t = new InboundEmailTest("inboundEmail");

  it("mail provides the parsed source", async () => {
    expect((await (await t.createInboundEmailFromFixture("welcome.eml"))!.mail()).subject()).toBe(
      "Discussion: Let's debate these attachments",
    );
  });

  it("source returns the contents of the raw email", async () => {
    expect(
      new TextDecoder().decode(
        await (await t.createInboundEmailFromFixture("welcome.eml"))!.source(),
      ),
    ).toBe(await t.fileFixture("welcome.eml").read());
  });

  it("email with message id is processed only once when received multiple times", async () => {
    const mail = Mail.fromSource(await t.fileFixture("welcome.eml").read());
    expect(mail.messageId()).toBeTruthy();

    const inboundEmail1 = await t.createInboundEmailFromSource(mail.toString());
    expect(inboundEmail1).toBeTruthy();

    const inboundEmail2 = await t.createInboundEmailFromSource(mail.toString());
    expect(inboundEmail2).toBeNull();
  });

  it("email with missing message id is processed only once when received multiple times", async () => {
    const mail = Mail.fromSource(
      "Date: Fri, 28 Sep 2018 11:08:55 -0700\r\nTo: a@example.com\r\nMime-Version: 1.0\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: 7bit\r\n\r\nHello!",
    );
    expect(mail.messageId()).toBeNull();

    const inboundEmail1 = await t.createInboundEmailFromSource(mail.toString());
    expect(inboundEmail1).toBeTruthy();

    const inboundEmail2 = await t.createInboundEmailFromSource(mail.toString());
    expect(inboundEmail2).toBeNull();
  });

  it("error on upload doesn't leave behind a pending inbound email", async () => {
    await stub(
      Blob.service as Service,
      "upload",
      () => {
        throw new Error("Boom!");
      },
      undefined,
      async () => {
        await assertNoDifference(
          () => InboundEmail.count(),
          null,
          async () => {
            await expect(t.createInboundEmailFromFixture("welcome.eml")).rejects.toThrow();
          },
        );
      },
    );
  });

  it("email gets saved to the configured storage service", async () => {
    try {
      ActionMailbox.storageService = "test_email";

      expect(ActionMailbox.storageService).toBe("test_email");

      const email = (await t.createInboundEmailFromFixture("welcome.eml"))!;

      const storageService = Blob.services.fetch(ActionMailbox.storageService);
      const raw = await (email as unknown as { rawEmailBlob: Promise<Blob> }).rawEmailBlob;

      expect(await (Blob.service as Service).isExist(raw.key)).toBeFalsy();
      expect(await storageService.isExist(raw.key)).toBeTruthy();
    } finally {
      ActionMailbox.storageService = null;
    }
  });

  it("email gets saved to the default storage service, even if it gets changed", async () => {
    const defaultService = Blob.service as Service;
    try {
      Blob.service = Blob.services.fetch("test_email");

      expect(ActionMailbox.storageService).toBeNull();

      const email = (await t.createInboundEmailFromFixture("welcome.eml"))!;
      const raw = await (email as unknown as { rawEmailBlob: Promise<Blob> }).rawEmailBlob;

      expect(await defaultService.isExist(raw.key)).toBeFalsy();
      expect(await Blob.service!.isExist(raw.key)).toBeTruthy();
    } finally {
      Blob.service = defaultService;
    }
  });
});
