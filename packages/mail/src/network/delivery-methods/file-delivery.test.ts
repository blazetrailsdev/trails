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
      expect(await File.readAsync(delivery)).toMatch(
        /Subject: invalid RFC2822\r\n[\s\S]*\r\n\r\n$/,
      );
    });

    it("should use the base name of the file name to prevent file system traversal", async () => {
      const location = Dir.mktmpdir("mails");
      const mail = new Message();
      mail.setFrom("roger@moore.com");
      mail.setTo("../../../../../../../../../../../tmp/pwn");
      mail.setSubject("evil hacker");
      await new FileDelivery({ location }).deliverBang(mail);
      expect(File.isExist(File.join(location, "pwn"))).toBe(true);
    });
  });
});
