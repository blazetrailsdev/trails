import { describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { File } from "@blazetrails/ruby-compat";
import "../../support/database/setup.js";
import { InboundEmail } from "../../../lib/inbound-email.js";

class MessageIdTest extends TestCase {}
MessageIdTest.fileFixturePath = File.expandPath("../../fixtures/files", import.meta.dirname);

async function createInboundEmailFromFixture(fixtureName: string, status = "processing") {
  return await createInboundEmailFromSource(
    await new MessageIdTest("fileFixture").fileFixture(fixtureName).read(),
    status,
  );
}

async function createInboundEmailFromSource(source: string, status = "processing") {
  return await InboundEmail.createAndExtractMessageIdBang(source, { status: status });
}

describe("ActionMailbox::InboundEmail::MessageIdTest", () => {
  it("message id is extracted from raw email", async () => {
    const inboundEmail = await createInboundEmailFromFixture("welcome.eml");
    expect(inboundEmail!.message_id).toBe("0CB459E0-0336-41DA-BC88-E6E28C697DDB@37signals.com");
  });

  it("message id is generated if its missing", async () => {
    const inboundEmail = await createInboundEmailFromSource(
      "Date: Fri, 28 Sep 2018 11:08:55 -0700\r\nTo: a@example.com\r\nMime-Version: 1.0\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: 7bit\r\n\r\nHello!",
    );
    expect(inboundEmail!.message_id).not.toBeNull();
  });
});
