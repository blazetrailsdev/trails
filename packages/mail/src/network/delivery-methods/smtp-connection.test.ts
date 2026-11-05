import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMail, closeMockSmtp, deliveries, mockSmtp } from "../../test-helpers/mock-smtp.js";
import { SMTP as NetSMTP } from "@blazetrails/net-smtp";
import { Message } from "../../message.js";
import { SMTPConnection } from "./smtp-connection.js";

afterEach(closeMockSmtp);

async function withConnection<T>(fn: (smtp: NetSMTP) => Promise<T>): Promise<T> {
  const port = await mockSmtp();
  const smtp = (await NetSMTP.start("127.0.0.1", port)) as NetSMTP;
  try {
    return await fn(smtp);
  } finally {
    await smtp.finish();
  }
}

describe("SMTP Delivery Method", () => {
  const dotStuffed = async (body: string) => {
    const mail = new Message();
    mail.setFrom("from@example.com");
    mail.setTo("to@example.com");
    mail.setSubject("dot-stuff last line");
    mail.setBody(body);
    const message = await withConnection(async (smtp) => {
      const sendmail = vi.spyOn(smtp, "sendmail");
      await new SMTPConnection({ connection: smtp }).deliverBang(mail);
      return sendmail.mock.calls[0][0];
    });
    return new Message(message).decoded();
  };

  it("should not dot-stuff unterminated last line with no leading dot", async () => {
    expect(await dotStuffed("this is a test\n.\nonly a test")).toBe(
      "this is a test\n.\nonly a test",
    );
  });

  it("should not dot-stuff newline-terminated last line", async () => {
    expect(await dotStuffed("this is a test\n.\nonly a test\n.\n")).toBe(
      "this is a test\n.\nonly a test\n.\n",
    );
  });

  it("should send an email using open SMTP connection", async () => {
    const port = await mockSmtp();
    const smtp = (await NetSMTP.start("127.0.0.1", port)) as NetSMTP;
    try {
      const mail = buildMail();
      mail.setSmtpEnvelopeFrom("smtp_from@example.com");
      mail.setSmtpEnvelopeTo("smtp_to@example.com");
      await new SMTPConnection({ connection: smtp }).deliverBang(mail);
      expect(deliveries[0][0]).toBe(mail.encoded());
      expect(deliveries[0][1]).toBe("smtp_from@example.com");
      expect(deliveries[0][2]).toEqual(["smtp_to@example.com"]);
    } finally {
      await smtp.finish();
    }
  });

  it("should be able to return actual SMTP protocol response", async () => {
    const response = await withConnection((smtp) =>
      new SMTPConnection({ connection: smtp, port: 587, returnResponse: true }).deliverBang(
        buildMail(),
      ),
    );
    expect(String((response as { status: string }).status)).toBe("250");
  });

  it("should not raise errors if no sender is defined", async () => {
    const mail = new Message();
    mail.setTo("to@somemail.com");
    mail.setSubject("Email with no sender");
    mail.setBody("body");
    expect(mail.smtpEnvelopeFrom()).toBeNull();
    await withConnection((smtp) =>
      expect(
        new SMTPConnection({ connection: smtp, port: 587, returnResponse: true }).deliverBang(mail),
      ).rejects.toThrow("SMTP From address may not be blank: nil"),
    );
  });

  it("should raise an error if no recipient if defined", async () => {
    const mail = new Message();
    mail.setFrom("from@somemail.com");
    mail.setSubject("Email with no recipient");
    mail.setBody("body");
    expect(mail.smtpEnvelopeTo()).toEqual([]);
    await withConnection((smtp) =>
      expect(
        new SMTPConnection({ connection: smtp, port: 587, returnResponse: true }).deliverBang(mail),
      ).rejects.toThrow("SMTP To address may not be blank: []"),
    );
  });
});
