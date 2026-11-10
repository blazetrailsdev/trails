import { afterEach, describe, expect, it } from "vitest";
import { SMTP as NetSMTP } from "@blazetrails/net-smtp";
import { Configuration } from "../lib/configuration.js";
import { Exim, Mail, Sendmail, SMTPConnection } from "../lib/index.js";
import { closeMockSmtp, mockSmtp } from "./support/mock-smtp.js";

class MyTestDeliveryMethod {
  settings: Record<string, unknown>;

  constructor(values: Record<string, unknown>) {
    this.settings = Object.assign({}, values);
  }
}

type WithSettings = { settings: Record<string, unknown> };

afterEach(closeMockSmtp);

describe("Mail::Configuration", () => {
  describe("network configurations", () => {
    it("defaults delivery_method to smtp", () => {
      Object.assign(Configuration.instance(), new Configuration());
      Mail.defaults(function () {
        this.deliveryMethod(null, { address: "some.host" });
      });
      expect((Mail.deliveryMethod() as WithSettings).settings.address).toBe("some.host");
    });

    it("should be available from the Mail.defaults method", () => {
      Mail.defaults(function () {
        this.deliveryMethod("smtp", { address: "some.host" });
      });
      expect((Mail.deliveryMethod() as WithSettings).settings.address).toBe("some.host");
    });

    it("should configure sendmail", () => {
      Mail.defaults(function () {
        this.deliveryMethod("sendmail", { location: "/usr/bin/sendmail" });
      });
      expect((Mail.deliveryMethod() as object).constructor).toBe(Sendmail);
      expect((Mail.deliveryMethod() as WithSettings).settings.location).toBe("/usr/bin/sendmail");
    });

    it("should configure sendmail using a string", () => {
      Mail.defaults(function () {
        this.deliveryMethod("sendmail", { location: "/usr/bin/sendmail" });
      });
      expect((Mail.deliveryMethod() as object).constructor).toBe(Sendmail);
      expect((Mail.deliveryMethod() as WithSettings).settings.location).toBe("/usr/bin/sendmail");
    });

    it("should configure exim", () => {
      Mail.defaults(function () {
        this.deliveryMethod("exim", { location: "/usr/bin/exim" });
      });
      expect((Mail.deliveryMethod() as object).constructor).toBe(Exim);
      expect((Mail.deliveryMethod() as WithSettings).settings.location).toBe("/usr/bin/exim");
    });

    it("should configure an open SMTP connection", async () => {
      const smtp = (await NetSMTP.start("127.0.0.1", await mockSmtp())) as NetSMTP;
      try {
        Mail.defaults(function () {
          this.deliveryMethod("smtp_connection", { connection: smtp });
        });
        expect((Mail.deliveryMethod() as object).constructor).toBe(SMTPConnection);
        expect((Mail.deliveryMethod() as SMTPConnection).smtp).toBe(smtp);
      } finally {
        await smtp.finish();
      }
    });

    it("should accept a plug-in delivery method", () => {
      Mail.defaults(function () {
        this.deliveryMethod(MyTestDeliveryMethod, { option1: "one", option2: "two" });
      });
      expect((Mail.deliveryMethod() as object).constructor).toBe(MyTestDeliveryMethod);
      expect((Mail.deliveryMethod() as WithSettings).settings.option1).toBe("one");
      expect((Mail.deliveryMethod() as WithSettings).settings.option2).toBe("two");
    });
  });
});
