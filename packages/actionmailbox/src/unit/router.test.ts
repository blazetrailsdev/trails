import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError, TopLevel, constSet, rbModName } from "@blazetrails/ruby-compat";
import type { Message } from "@blazetrails/mail";
import "../test-helpers/database/setup.js";
import type { InboundEmail } from "../inbound-email.js";
import { Base } from "../base.js";
import "../inbound-email.js";
import { ActionMailbox } from "../action-mailbox.js";
import "../router.js";
import type { Router } from "../router.js";
import { TestCase } from "../test-case.js";

let $processedBy: string | null;
let $processedMail: Message | null;

class RootMailbox extends Base {
  async process(): Promise<void> {
    $processedBy = rbModName(this.constructor);
    $processedMail = await this.mail();
  }
}

class FirstMailbox extends RootMailbox {}

class SecondMailbox extends RootMailbox {}

const Nested = {};
constSet(TopLevel, "Nested", Nested);
constSet(Nested, "FirstMailbox", class FirstMailbox extends RootMailbox {});

constSet(TopLevel, "FirstMailbox", FirstMailbox);
constSet(TopLevel, "SecondMailbox", SecondMailbox);

class FirstMailboxAddress {
  async isMatch(inboundEmail: InboundEmail): Promise<boolean> {
    return ((await inboundEmail.mail()).to() as string[]).includes("replies-class@example.com");
  }
}

class RouterTest extends TestCase {}

describe("RouterTest", () => {
  let router: Router;
  const test = new RouterTest("router");
  const createInboundEmailFromMail = async (options: Record<string, unknown>) =>
    (await test.createInboundEmailFromMail(options))!;

  beforeEach(() => {
    router = new ActionMailbox.Router();
    $processedBy = $processedMail = null;
  });

  it("single string route", async () => {
    router.addRoutes({ "first@example.com": "first" });

    const inboundEmail = await createInboundEmailFromMail({
      to: "first@example.com",
      subject: "This is a reply",
    });
    await router.route(inboundEmail);
    expect($processedBy).toBe("FirstMailbox");
    expect($processedMail).toBe(await inboundEmail.mail());
  });

  it("single string routing on cc", async () => {
    router.addRoutes({ "first@example.com": "first" });

    const inboundEmail = await createInboundEmailFromMail({
      to: "someone@example.com",
      cc: "first@example.com",
      subject: "This is a reply",
    });
    await router.route(inboundEmail);
    expect($processedBy).toBe("FirstMailbox");
    expect($processedMail).toBe(await inboundEmail.mail());
  });

  it("single string routing on bcc", async () => {
    router.addRoutes({ "first@example.com": "first" });

    const inboundEmail = await createInboundEmailFromMail({
      to: "someone@example.com",
      bcc: "first@example.com",
      subject: "This is a reply",
    });
    await router.route(inboundEmail);
    expect($processedBy).toBe("FirstMailbox");
    expect($processedMail).toBe(await inboundEmail.mail());
  });

  it("single string routing case-insensitively", async () => {
    router.addRoutes({ "first@example.com": "first" });

    const inboundEmail = await createInboundEmailFromMail({
      to: "FIRST@example.com",
      subject: "This is a reply",
    });
    await router.route(inboundEmail);
    expect($processedBy).toBe("FirstMailbox");
    expect($processedMail).toBe(await inboundEmail.mail());
  });

  it("multiple string routes", async () => {
    router.addRoutes({ "first@example.com": "first", "second@example.com": "second" });

    let inboundEmail = await createInboundEmailFromMail({
      to: "first@example.com",
      subject: "This is a reply",
    });
    await router.route(inboundEmail);
    expect($processedBy).toBe("FirstMailbox");
    expect($processedMail).toBe(await inboundEmail.mail());

    inboundEmail = await createInboundEmailFromMail({
      to: "second@example.com",
      subject: "This is a reply",
    });
    await router.route(inboundEmail);
    expect($processedBy).toBe("SecondMailbox");
    expect($processedMail).toBe(await inboundEmail.mail());
  });

  it("single regexp route", async () => {
    router.addRoutes([
      [/replies-\w+@example.com/, "first"],
      ["replies-nowhere@example.com", "second"],
    ]);

    const inboundEmail = await createInboundEmailFromMail({
      to: "replies-okay@example.com",
      subject: "This is a reply",
    });
    await router.route(inboundEmail);
    expect($processedBy).toBe("FirstMailbox");
  });

  it("single proc route", async () => {
    router.addRoute(
      async (inboundEmail) =>
        ((await inboundEmail.mail()).to() as string[]).includes("replies-proc@example.com"),
      { to: "second" },
    );

    await router.route(
      await createInboundEmailFromMail({
        to: "replies-proc@example.com",
        subject: "This is a reply",
      }),
    );
    expect($processedBy).toBe("SecondMailbox");
  });

  it("address class route", async () => {
    router.addRoute(new FirstMailboxAddress(), { to: "first" });
    await router.route(
      await createInboundEmailFromMail({
        to: "replies-class@example.com",
        subject: "This is a reply",
      }),
    );
    expect($processedBy).toBe("FirstMailbox");
  });

  it("string route to nested mailbox", async () => {
    router.addRoute("first@example.com", { to: "nested/first" });

    const inboundEmail = await createInboundEmailFromMail({
      to: "first@example.com",
      subject: "This is a reply",
    });
    await router.route(inboundEmail);
    expect($processedBy).toBe("Nested::FirstMailbox");
  });

  it("all as the only route", async () => {
    router.addRoute(":all", { to: "first" });
    await router.route(
      await createInboundEmailFromMail({
        to: "replies-class@example.com",
        subject: "This is a reply",
      }),
    );
    expect($processedBy).toBe("FirstMailbox");
  });

  it("all as the second route", async () => {
    router.addRoute(new FirstMailboxAddress(), { to: "first" });
    router.addRoute(":all", { to: "second" });

    await router.route(
      await createInboundEmailFromMail({
        to: "replies-class@example.com",
        subject: "This is a reply",
      }),
    );
    expect($processedBy).toBe("FirstMailbox");

    await router.route(
      await createInboundEmailFromMail({ to: "elsewhere@example.com", subject: "This is a reply" }),
    );
    expect($processedBy).toBe("SecondMailbox");
  });

  it("missing route", async () => {
    const inboundEmail = await createInboundEmailFromMail({
      to: "going-nowhere@example.com",
      subject: "This is a reply",
    });
    await expect(router.route(inboundEmail)).rejects.toThrow(ActionMailbox.Router.RoutingError);
    expect(inboundEmail.isBounced()).toBeTruthy();
  });

  it("invalid address", () => {
    let error: unknown;
    expect(() => {
      try {
        router.addRoute([] as never, { to: "first" });
      } catch (e) {
        error = e;
        throw e;
      }
    }).toThrow(ArgumentError);
    expect((error as Error).message).toBe(
      "Expected a Symbol, String, Regexp, Proc, or matchable, got []",
    );
  });

  it("single string mailbox_for", async () => {
    router.addRoutes({ "first@example.com": "first" });

    const inboundEmail = await createInboundEmailFromMail({
      to: "first@example.com",
      subject: "This is a reply",
    });
    expect(await router.mailboxFor(inboundEmail)).toBe(FirstMailbox);
  });

  it("mailbox_for with no matches", async () => {
    router.addRoutes({ "first@example.com": "first" });

    const inboundEmail = await createInboundEmailFromMail({
      to: "second@example.com",
      subject: "This is a reply",
    });
    expect(await router.mailboxFor(inboundEmail)).toBeNull();
  });
});
