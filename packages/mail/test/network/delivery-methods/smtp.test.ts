import { afterEach, describe, expect, it, vi } from "vitest";
import { SMTP as NetSMTP } from "@blazetrails/net-smtp";
import { buildMail, closeMockSmtp, deliveries, mockSmtp } from "../../support/mock-smtp.js";
import { ArgumentError, OpenSSL, rbInspect } from "@blazetrails/ruby-compat";
import { Message } from "../../../lib/message.js";
import { SMTP } from "../../../lib/network/delivery-methods/smtp.js";
import { NULL_SENDER } from "../../../lib/constants.js";

afterEach(closeMockSmtp);

describe("SMTP Delivery Method", () => {
  describe("general usage", () => {
    it("should send emails from given settings", async () => {
      const port = await mockSmtp();
      const mail = buildMail();
      mail.setSmtpEnvelopeFrom("smtp_from@example.com");
      mail.setSmtpEnvelopeTo("smtp_to@example.com");
      await new SMTP({ address: "127.0.0.1", port }).deliverBang(mail);
      expect(deliveries[0][0]).toBe(mail.encoded());
      expect(deliveries[0][1]).toBe("smtp_from@example.com");
      expect(deliveries[0][2]).toEqual(["smtp_to@example.com"]);
    });

    it("should be able to send itself", async () => {
      const port = await mockSmtp();
      const mail = buildMail();
      await new SMTP({ address: "127.0.0.1", port }).deliverBang(mail);
      expect(deliveries[0][0]).toBe(mail.encoded());
      expect(deliveries[0][1]).toBe((mail.from() as string[])[0]);
      expect(deliveries[0][2]).toEqual(mail.destinations());
    });

    it("should be able to return actual SMTP protocol response", async () => {
      const port = await mockSmtp();
      const response = await new SMTP({
        address: "127.0.0.1",
        port,
        returnResponse: true,
      }).deliverBang(buildMail());
      expect((response as { message: string }).message.slice(4).trim()).toBe("OK");
    });
  });

  describe("enabling tls", () => {
    const VERIFY_NONE = OpenSSL.SSL.VERIFY_NONE;
    const redefineVerifyNone = (newValue: unknown) => {
      (OpenSSL.SSL as { VERIFY_NONE: unknown }).VERIFY_NONE = newValue;
    };
    const deliver = async () => {
      const start = vi.spyOn(NetSMTP.prototype, "start").mockResolvedValue(null);
      try {
        const mail = new SMTP({
          address: "smtp.mockup.com",
          port: 587,
        });
        await mail.deliverBang(buildMail());
      } finally {
        start.mockRestore();
      }
    };

    afterEach(() => redefineVerifyNone(VERIFY_NONE));

    it("should use OpenSSL::SSL::VERIFY_NONE if a context", async () => {
      redefineVerifyNone(NetSMTP.defaultSslContext());
      await expect(deliver()).resolves.not.toThrow();
    });

    it("should ignore OpenSSL::SSL::VERIFY_NONE if it is 0", async () => {
      redefineVerifyNone(0);
      await expect(deliver()).resolves.not.toThrow();
    });
  });

  describe("enabling ssl", () => {
    const VERIFY_NONE = OpenSSL.SSL.VERIFY_NONE;
    const redefineVerifyNone = (newValue: unknown) => {
      (OpenSSL.SSL as { VERIFY_NONE: unknown }).VERIFY_NONE = newValue;
    };
    const deliver = async () => {
      const start = vi.spyOn(NetSMTP.prototype, "start").mockResolvedValue(null);
      try {
        const mail = new SMTP({
          address: "smtp.mockup.com",
          port: 587,
          tls: true,
        });
        await mail.deliverBang(buildMail());
      } finally {
        start.mockRestore();
      }
    };

    afterEach(() => redefineVerifyNone(VERIFY_NONE));

    it("should use OpenSSL::SSL::VERIFY_NONE if a context", async () => {
      redefineVerifyNone(NetSMTP.defaultSslContext());
      await expect(deliver()).resolves.not.toThrow();
    });

    it("should ignore OpenSSL::SSL::VERIFY_NONE if it is 0", async () => {
      redefineVerifyNone(0);
      await expect(deliver()).resolves.not.toThrow();
    });
    const verifyModeDelivery = (settings: Record<string, unknown>) => {
      const verifyMode = vi.fn();
      const context = {};
      Object.defineProperty(context, "verifyMode", { set: verifyMode });
      const deliver = async () => {
        const defaultSslContext = vi.spyOn(NetSMTP, "defaultSslContext").mockReturnValue(context);
        const start = vi.spyOn(NetSMTP.prototype, "start").mockResolvedValue(null);
        try {
          await new SMTP({
            address: "smtp.mockup.com",
            port: 587,
            tls: true,
            ...settings,
          }).deliverBang(buildMail());
        } finally {
          start.mockRestore();
          defaultSslContext.mockRestore();
        }
      };
      return { verifyMode, deliver };
    };

    it("should not set verify mode when none is given", async () => {
      const { verifyMode, deliver } = verifyModeDelivery({});
      await expect(deliver()).resolves.not.toThrow();
      expect(verifyMode).not.toHaveBeenCalled();
    });

    it("should set verify mode if one is given", async () => {
      const { verifyMode, deliver } = verifyModeDelivery({ opensslVerifyMode: "peer" });
      await expect(deliver()).resolves.not.toThrow();
      expect(verifyMode).toHaveBeenCalledWith("VERIFY_PEER");
    });
  });

  describe("enabling STARTTLS", () => {
    const deliveredStarttls = async (settings: Record<string, unknown>) => {
      let starttls: boolean | string | undefined;
      const start = vi.spyOn(NetSMTP.prototype, "start").mockImplementation(function (
        this: NetSMTP,
      ) {
        starttls = this.isStarttls();
        return Promise.resolve(null);
      });
      const message = new Message();
      message.setFrom("mikel@test.lindsaar.net");
      message.setTo("ada@test.lindsaar.net");
      message.setSubject("Re: No way!");
      message.setBody("Yeah sure");
      try {
        await new SMTP({
          address: "localhost",
          port: 25,
          domain: "localhost.localdomain",
          userName: null,
          password: null,
          authentication: null,
          ...settings,
        }).deliverBang(message);
      } finally {
        start.mockRestore();
      }
      return starttls;
    };

    it("should default to automatically detecting STARTTLS", async () => {
      expect(await deliveredStarttls({})).toBe("auto");
    });

    it("should allow forcing STARTTLS", async () => {
      expect(await deliveredStarttls({ enableStarttls: true })).toBe("always");
    });

    it("should allow disabling automatic STARTTLS", async () => {
      expect(await deliveredStarttls({ enableStarttls: false })).toBe(false);
    });

    it("should allow forcing STARTTLS auto", async () => {
      expect(await deliveredStarttls({ enableStarttlsAuto: true })).toBe("auto");
    });

    it("should allow disabling automatic STARTTLS auto", async () => {
      expect(await deliveredStarttls({ enableStarttlsAuto: false })).toBe(false);
    });
  });

  describe("SMTP Envelope", () => {
    const envelopeMail = () => {
      const mail = new Message();
      mail.setTo("to@someemail.com");
      mail.setFrom("from@someemail.com");
      mail.setMessageId("<1234@someemail.com>");
      mail.setBody("body");
      mail.setSmtpEnvelopeTo("smtp_to@someemail.com");
      return mail;
    };

    it("uses the envelope From and To addresses", async () => {
      const port = await mockSmtp();
      const mail = envelopeMail();
      mail.setSmtpEnvelopeFrom("smtp_from@someemail.com");
      await new SMTP({ address: "127.0.0.1", port }).deliverBang(mail);
      expect(deliveries[0][1]).toBe("smtp_from@someemail.com");
      expect(deliveries[0][2]).toEqual(["smtp_to@someemail.com"]);
    });

    it("supports the null sender in the envelope from address", async () => {
      const port = await mockSmtp();
      const mail = envelopeMail();
      mail.setSmtpEnvelopeFrom(NULL_SENDER);
      const sendmail = vi.spyOn(NetSMTP.prototype, "sendmail").mockResolvedValue(null as never);
      try {
        await new SMTP({ address: "127.0.0.1", port }).deliverBang(mail);
        expect(sendmail.mock.calls[0][1]).toBe("<>");
        expect(sendmail.mock.calls[0][2]).toEqual(["smtp_to@someemail.com"]);
      } finally {
        sendmail.mockRestore();
      }
    });

    it("should raise an error if there is no envelope From address", async () => {
      const mail = new Message();
      mail.setTo("to@somemail.com");
      mail.setSubject("Email with no sender");
      mail.setBody("body");
      expect(mail.smtpEnvelopeFrom()).toBeNull();
      const port = await mockSmtp();
      await expect(new SMTP({ address: "127.0.0.1", port }).deliverBang(mail)).rejects.toThrow(
        new ArgumentError("SMTP From address may not be blank: nil"),
      );
    });

    it("should raise an error if no recipient if defined", async () => {
      const mail = new Message();
      mail.setFrom("from@somemail.com");
      mail.setSubject("Email with no recipient");
      mail.setBody("body");
      expect(mail.smtpEnvelopeTo()).toEqual([]);
      const port = await mockSmtp();
      await expect(new SMTP({ address: "127.0.0.1", port }).deliverBang(mail)).rejects.toThrow(
        new ArgumentError("SMTP To address may not be blank: []"),
      );
    });

    it("should raise on SMTP injection via MAIL FROM newlines", async () => {
      const port = await mockSmtp();
      const addr = "inject.from@example.com>\r\nDATA";
      const mail = buildMail();
      mail.setSmtpEnvelopeFrom(addr);
      expect(mail.smtpEnvelopeFrom()).toBe(addr);
      await expect(new SMTP({ address: "127.0.0.1", port }).deliverBang(mail)).rejects.toThrow(
        `SMTP From address may not contain CR or LF line breaks: ${rbInspect(addr)}`,
      );
    });

    const injected = async (from: string, to: string, message: string) => {
      const port = await mockSmtp();
      const mail = new Message();
      mail.setFrom(from);
      mail.setTo(to);
      await expect(new SMTP({ address: "127.0.0.1", port }).deliverBang(mail)).rejects.toThrow(
        new ArgumentError(message),
      );
      return mail;
    };

    it("should raise on SMTP injection via RCPT TO newlines", async () => {
      const addr = "inject.to@example.com>\r\nDATA";
      const mail = await injected(
        "from@somemail.com",
        addr,
        `SMTP To address may not contain CR or LF line breaks: ${rbInspect(addr)}`,
      );
      expect(mail.smtpEnvelopeTo()).toEqual([addr]);
    });

    it("should raise on SMTP injection via MAIL FROM overflow", async () => {
      const addr = `inject.from@example.com${"m".repeat(2000)}`;
      const mail = await injected(
        addr,
        "to@somemail.com",
        `SMTP From address may not exceed 2000 bytes: ${rbInspect(addr)}`,
      );
      expect(mail.smtpEnvelopeFrom()).toBe(addr);
    });

    it("should raise on SMTP injection via RCPT TO overflow", async () => {
      const addr = `inject.to@example.com${"m".repeat(2000)}`;
      const mail = await injected(
        "from@somemail.com",
        addr,
        `SMTP To address may not exceed 2000 bytes: ${rbInspect(addr)}`,
      );
      expect(mail.smtpEnvelopeTo()).toEqual([addr]);
    });
  });
});
