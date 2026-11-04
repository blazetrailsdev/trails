import { beforeEach, describe, expect, it } from "vitest";
import { Message } from "../../message.js";
import { TestMailer } from "./test-mailer.js";

describe("Mail::TestMailer", () => {
  beforeEach(() => {
    TestMailer.deliveries = [];
  });

  it("should have no deliveries when first initiated", () => {
    expect(TestMailer.deliveries.length).toBe(0);
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
    await expect(new TestMailer({}).deliverBang(mail)).rejects.toThrow(
      "SMTP To address may not be blank: []",
    );
  });
});
