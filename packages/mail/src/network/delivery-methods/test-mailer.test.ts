import { beforeEach, describe, expect, it } from "vitest";
import { Message } from "../../message.js";
import { TestMailer } from "./test-mailer.js";

describe("Mail::TestMailer", () => {
  beforeEach(() => {
    TestMailer.deliveries = [];
  });

  it("should have no deliveries when first initiated", () => {
    expect(TestMailer.deliveries).toBeEmpty();
  });

  it("should deliver an email to the Mail::TestMailer.deliveries array", async () => {
    const mail = new Message();
    mail.setFrom("mikel@me.com");
    mail.setTo("you@you.com");
    mail.setSubject("testing");
    mail.setBody("hello");
    await new TestMailer({}).deliverBang(mail);
    expect(TestMailer.deliveries.length).toBe(1);
    expect(TestMailer.deliveries[0]).toBe(mail);
  });

  it("should raise an error if no recipient if defined", async () => {
    const mail = new Message();
    mail.setFrom("from@somemail.com");
    mail.setBody("body");
    expect(mail.smtpEnvelopeTo()).toEqual([]);
    await expect(new TestMailer({}).deliverBang(mail)).rejects.toThrow(
      "SMTP To address may not be blank: []",
    );
  });

  it("should clear the deliveries when told to", async () => {
    const mail = new Message();
    mail.setTo("mikel@me.com");
    mail.setFrom("you@you.com");
    mail.setSubject("testing");
    mail.setBody("hello");
    await new TestMailer({}).deliverBang(mail);
    expect(TestMailer.deliveries.length).toBe(1);
    TestMailer.deliveries.length = 0;
    expect(TestMailer.deliveries).toBeEmpty();
  });

  it("should not raise errors if no sender is defined", async () => {
    const mail = new Message();
    mail.setTo("to@somemail.com");
    mail.setSubject("Email with no sender");
    mail.setBody("body");
    expect(mail.smtpEnvelopeFrom()).toBeNull();
    await expect(new TestMailer({}).deliverBang(mail)).rejects.toThrow(
      "SMTP From address may not be blank: nil",
    );
  });

  it("should save settings passed to initialize", () => {
    expect(new TestMailer({ setting: true }).settings).toMatchObject({ setting: true });
  });
});
