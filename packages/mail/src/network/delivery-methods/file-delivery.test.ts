import { describe, expect, it } from "vitest";
import { Dir, File } from "@blazetrails/ruby-compat";
import { Message } from "../../message.js";
import { FileDelivery } from "./file-delivery.js";

describe("SMTP Delivery Method", () => {
  describe("general usage", () => {
    it("should send an email to a file", async () => {
      const location = Dir.mktmpdir("mails");
      const mail = new Message();
      mail.setFrom("roger@moore.com");
      mail.setTo("marcel@amont.com");
      mail.setSubject("invalid RFC2822");
      await new FileDelivery({ location }).deliverBang(mail);
      const delivery = File.join(location, "marcel@amont.com");
      expect(await File.readAsync(delivery)).toBe(`${mail.encoded()}\r\n\r\n`);
    });

    const deliver = async (
      location: string,
      from: string | null,
      to: string | null,
      subject: string,
    ) => {
      const mail = new Message();
      if (from !== null) mail.setFrom(from);
      if (to !== null) mail.setTo(to);
      mail.setSubject(subject);
      await new FileDelivery({ location }).deliverBang(mail);
      return mail;
    };

    it("should send multiple emails to multiple files", async () => {
      const location = Dir.mktmpdir("mails");
      const mail = await deliver(
        location,
        "roger@moore.com",
        "marcel@amont.com, bob@me.com",
        "invalid RFC2822",
      );
      const deliveryOne = File.join(location, "marcel@amont.com");
      const deliveryTwo = File.join(location, "bob@me.com");
      expect(await File.readAsync(deliveryOne)).toBe(`${mail.encoded()}\r\n\r\n`);
      expect(await File.readAsync(deliveryTwo)).toBe(`${mail.encoded()}\r\n\r\n`);
    });

    it("should only create files based on the addr_spec of the destination", async () => {
      const location = Dir.mktmpdir("mails");
      await deliver(
        location,
        "roger@moore.com",
        '"Long, stupid email address" <mikel@test.lindsaar.net>',
        "invalid RFC2822",
      );
      expect(await File.isExistAsync(File.join(location, "mikel@test.lindsaar.net"))).toBe(true);
    });

    it("should use the base name of the file name to prevent file system traversal", async () => {
      const location = Dir.mktmpdir("mails");
      await deliver(
        location,
        "roger@moore.com",
        "../../../../../../../../../../../tmp/pwn",
        "evil hacker",
      );
      expect(await File.isExistAsync(File.join(location, "pwn"))).toBe(true);
    });

    it("should not raise errors if no sender is defined", async () => {
      const mail = new Message();
      mail.setTo("to@somemail.com");
      mail.setSubject("Email with no sender");
      mail.setBody("body");
      expect(mail.smtpEnvelopeFrom()).toBeNull();
      await expect(
        new FileDelivery({ location: Dir.mktmpdir("mails") }).deliverBang(mail),
      ).rejects.toThrow("SMTP From address may not be blank: nil");
    });

    it("should raise an error if no recipient if defined", async () => {
      const mail = new Message();
      mail.setFrom("from@somemail.com");
      mail.setSubject("Email with no recipient");
      mail.setBody("body");
      expect(mail.smtpEnvelopeTo()).toEqual([]);
      await expect(
        new FileDelivery({ location: Dir.mktmpdir("mails") }).deliverBang(mail),
      ).rejects.toThrow("SMTP To address may not be blank: []");
    });
  });
});
