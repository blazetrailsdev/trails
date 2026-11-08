import { describe, expect, it, vi } from "vitest";
import { Logger, StringIO } from "@blazetrails/ruby-compat";
import { Message } from "../../../lib/message.js";
import { LoggerDelivery } from "../../../lib/network/delivery-methods/logger-delivery.js";

describe("Logger Delivery Method", () => {
  const buildMail = () => {
    const mail = new Message();
    mail.setFrom("dschrute@dm.com");
    mail.setTo("mscarn@dm.com");
    mail.setSubject("Beet Bandit");
    return mail;
  };

  it("sends an email to $stdout with 'info' severity by default", async () => {
    const mail = buildMail();
    const deliveryMethod = new LoggerDelivery({});
    const log = vi.spyOn(deliveryMethod.logger, "log").mockReturnValue(true);
    await deliveryMethod.deliverBang(mail);
    expect(log).toHaveBeenCalledWith(Logger.INFO, null, null, expect.any(Function));
  });

  it("can be configured with a custom logger and severity", async () => {
    const mail = buildMail();
    const customLogger = { log: vi.fn().mockReturnValue(true) };
    await new LoggerDelivery({ logger: customLogger, severity: "debug" }).deliverBang(mail);
    expect(customLogger.log).toHaveBeenCalledWith(Logger.DEBUG, null, null, expect.any(Function));
  });

  describe("sender and recipient validation", () => {
    it("should not raise errors if no sender is defined", async () => {
      const mail = new Message();
      mail.setTo("to@somemail.com");
      mail.setSubject("Email with no sender");
      mail.setBody("body");
      expect(mail.smtpEnvelopeFrom()).toBeNull();
      await expect(
        new LoggerDelivery({ logger: new Logger(new StringIO()) }).deliverBang(mail),
      ).rejects.toThrow("SMTP From address may not be blank: nil");
    });

    it("should raise an error if no recipient if defined", async () => {
      const mail = new Message();
      mail.setFrom("from@somemail.com");
      mail.setSubject("Email with no recipient");
      mail.setBody("body");
      expect(mail.smtpEnvelopeTo()).toEqual([]);
      await expect(
        new LoggerDelivery({ logger: new Logger(new StringIO()) }).deliverBang(mail),
      ).rejects.toThrow("SMTP To address may not be blank: []");
    });
  });
});
