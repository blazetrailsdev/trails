import { describe, expect, it } from "vitest";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";

class BaseMailer extends Base {
  static {
    this.setMailerName("base_mailer");
    this.default({
      to: "system@test.lindsaar.net",
      from: "jose@test.plataformatec.com",
      replyTo: this.emailAddressWithName("mikel@test.lindsaar.net", "Mikel"),
    });
  }
}

describe("BaseTest", () => {
  it("action methods should be refreshed after defining new method", () => {
    class FooMailer extends Base {
      static {
        rbObjRespondTo(this, "foo");
      }

      notify() {}
    }

    expect(new Set(FooMailer.actionMethods())).toEqual(new Set(["notify"]));
  });

  it("email_address_with_name escapes", () => {
    const address = BaseMailer.emailAddressWithName("test@example.org", 'I "<3" email');
    expect(address).toBe('"I \\"<3\\" email" <test@example.org>');
  });
});
