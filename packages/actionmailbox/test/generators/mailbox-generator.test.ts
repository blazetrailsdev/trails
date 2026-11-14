import { File, TopLevel, constSet, rbModRemoveConst } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { capture } from "@blazetrails/activesupport/testing/stream";
import { TestCase } from "@blazetrails/trailties/generators/test-case";
import "@blazetrails/trailties/test-unit/trailtie";
import { beforeEach, describe, expect, it } from "vitest";
import "../../lib/action-mailbox.js";
import { MailboxGenerator } from "../../lib/trails/generators/mailbox/mailbox-generator.js";

class MailboxGeneratorTest extends TestCase {}
MailboxGeneratorTest.destination(File.expandPath("../../tmp", import.meta.dirname));
MailboxGeneratorTest.tests(MailboxGenerator);
MailboxGeneratorTest.arguments(["inbox"]);
registerSpecType(/^MailboxGeneratorTest$/, MailboxGeneratorTest);
let t: TestCase;

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
});

describe("MailboxGeneratorTest", () => {
  it("mailbox skeleton is created", async () => {
    await t.runGenerator();

    await t.assertFile("app/mailboxes/inbox-mailbox.ts", (mailbox) => {
      expect(mailbox).toMatch(/class InboxMailbox extends ApplicationMailbox/);
      expect(mailbox).toMatch(/process\(\)/);
      expect(mailbox).not.toMatch(/\/\/ routing \/something\/i => :somewhere/);
    });

    await t.assertFile("app/mailboxes/application-mailbox.ts", (mailbox) => {
      expect(mailbox).toMatch(/class ApplicationMailbox extends ActionMailbox\.Base/);
      expect(mailbox).toMatch(/\/\/ routing \/something\/i => :somewhere/);
      expect(mailbox).not.toMatch(/process\(\)/);
    });
  });

  it("mailbox skeleton is created with namespace", async () => {
    await t.runGenerator(["inceptions/inbox", "-t=test_unit"]);

    await t.assertFile("app/mailboxes/inceptions/inbox-mailbox.ts", (mailbox) => {
      expect(mailbox).toMatch(/class InboxMailbox extends ApplicationMailbox/);
      expect(mailbox).toMatch(/process\(\)/);
      expect(mailbox).not.toMatch(/\/\/ routing \/something\/i => :somewhere/);
    });

    await t.assertFile("test/mailboxes/inceptions/inbox-mailbox.test.ts", (mailbox) => {
      expect(mailbox).toMatch(/class InboxMailboxTest extends ActionMailbox\.TestCase/);
      expect(mailbox).toMatch(/\/\/ test\("receive mail"/);
      expect(mailbox).toMatch(/\/\/ {5}to: '"someone" <someone@example\.com>',/);
    });

    await t.assertFile("app/mailboxes/application-mailbox.ts", (mailbox) => {
      expect(mailbox).toMatch(/class ApplicationMailbox extends ActionMailbox\.Base/);
      expect(mailbox).toMatch(/\/\/ routing \/something\/i => :somewhere/);
      expect(mailbox).not.toMatch(/process\(\)/);
    });
  });

  it("check class collision", async () => {
    constSet(TopLevel, "InboxMailbox", class {});
    try {
      const content = await capture("stderr", () => t.runGenerator());
      expect(content).toMatch(
        /The name 'InboxMailbox' is either already used in your application or reserved/,
      );
    } finally {
      rbModRemoveConst(TopLevel, "InboxMailbox");
    }
  });

  it("invokes default test framework", async () => {
    await t.runGenerator(["inbox", "-t=test_unit"]);

    await t.assertFile("test/mailboxes/inbox-mailbox.test.ts", (test) => {
      expect(test).toMatch(/class InboxMailboxTest extends ActionMailbox\.TestCase/);
      expect(test).toMatch(/\/\/ test\("receive mail"/);
      expect(test).toMatch(/\/\/ {5}to: '"someone" <someone@example\.com>',/);
    });
  });

  it("mailbox on revoke", async () => {
    await t.runGenerator();
    await t.runGenerator(["inbox"], { behavior: "revoke" });

    t.assertNoFile("app/mailboxes/inbox-mailbox.ts");
  });

  it("mailbox suffix is not duplicated", async () => {
    await t.runGenerator(["inbox_mailbox", "-t=test_unit"]);

    t.assertNoFile("app/mailboxes/inbox-mailbox-mailbox.ts");
    await t.assertFile("app/mailboxes/inbox-mailbox.ts");

    t.assertNoFile("test/mailboxes/inbox-mailbox-mailbox.test.ts");
    await t.assertFile("test/mailboxes/inbox-mailbox.test.ts");
  });
});
