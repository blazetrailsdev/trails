import { describe, expect, it } from "vitest";
import { File } from "@blazetrails/ruby-compat";
import "../test-helpers/database/setup.js";
import "../inbound-email.js";
import { TestCase } from "../test-case.js";

class TestHelperTest extends TestCase {}
TestHelperTest.fileFixturePath = File.expandPath(
  "../test-helpers/fixtures/files",
  import.meta.dirname,
);

describe("ActionMailbox::TestHelperTest", () => {
  it("multi-part mail can be built in tests using a block", async () => {
    const test = new TestHelperTest("multi-part mail can be built in tests using a block");
    const inboundEmail = await test.createInboundEmailFromMail(function () {
      this.to("test@example.com");
      this.from("hello@example.com");

      this.textPart(function () {
        this.body("Hello, world");
      });

      this.htmlPart(function () {
        this.body("<h1>Hello, world</h1>");
      });
    });

    const mail = await inboundEmail!.mail();

    const expectedMailTextPart =
      "Content-Type: text/plain;\r\n charset=UTF-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\nHello, world";

    const expectedMailHtmlPart =
      "Content-Type: text/html;\r\n charset=UTF-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\n<h1>Hello, world</h1>";

    expect(mail.parts.length).toBe(2);
    expect(String(mail.textPart())).toBe(expectedMailTextPart);
    expect(String(mail.htmlPart())).toBe(expectedMailHtmlPart);
  });
});
