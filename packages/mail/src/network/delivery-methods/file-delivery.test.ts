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
  });
});
