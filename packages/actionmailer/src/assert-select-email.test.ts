import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Assertion } from "@blazetrails/activesupport";
import { Assertions } from "@blazetrails/actionview/rails-dom-testing/assertions";
import { block, include } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import type { MessageDelivery } from "./message-delivery.js";

class AssertSelectMailer extends Base {
  test(html: string) {
    return this.mail({
      body: html,
      contentType: "text/html",
      subject: "Test e-mail",
      from: "test@test.host",
      to: "test <test@test.host>",
    });
  }
}

class AssertMultipartSelectMailer extends Base {
  test(options: { text: string; html: string }) {
    return this.mail(
      { subject: "Test e-mail", from: "test@test.host", to: "test <test@test.host>" },
      (format) => {
        const f = format as unknown as {
          text(b: () => unknown): void;
          html(b: () => unknown): void;
        };
        f.text(() => this.render({ plain: options.text }));
        f.html(() => this.render({ plain: options.html }));
      },
    );
  }
}

type Mailer<A> = { test(arg: A): MessageDelivery };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class AssertSelectEmailTest {
  documentRootElement(): never {
    throw new Error("no document");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface AssertSelectEmailTest {
  assertSelect(...args: unknown[]): unknown;
  assertSelectEmail(options?: object, block?: () => void): void;
}
include(AssertSelectEmailTest, Assertions);

describe("AssertSelectEmailTest", () => {
  const t = new AssertSelectEmailTest();

  let oldDeliveryMethod: typeof Base.deliveryMethod;

  beforeEach(() => {
    oldDeliveryMethod = Base.deliveryMethod;
    Base.deliveryMethod = "test";
    Base.deliveries.length = 0;
  });

  afterEach(() => {
    Base.deliveryMethod = oldDeliveryMethod;
  });

  it("assert select email", async () => {
    expect(() => t.assertSelectEmail({}, () => {})).toThrow(Assertion);

    await (AssertSelectMailer as unknown as Mailer<string>)
      .test("<div><p>foo</p><p>bar</p></div>")
      .deliverNow();
    t.assertSelectEmail({}, () => {
      t.assertSelect(
        "div:root",
        block(() => {
          t.assertSelect("p:first-child", "foo");
          t.assertSelect("p:last-child", "bar");
        }),
      );
    });
  });

  it("assert select email multipart", async () => {
    await (AssertMultipartSelectMailer as unknown as Mailer<{ text: string; html: string }>)
      .test({ html: "<div><p>foo</p><p>bar</p></div>", text: "foo bar" })
      .deliverNow();
    t.assertSelectEmail({}, () => {
      t.assertSelect(
        "div:root",
        block(() => {
          t.assertSelect("p:first-child", "foo");
          t.assertSelect("p:last-child", "bar");
        }),
      );
    });
  });
});
