import { FixtureResolver } from "@blazetrails/actionview/testing/resolvers";
import { ActionController, MiddlewareStack, RouteSet, deprecator } from "@blazetrails/actionpack";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { I18n, type Configuration } from "@blazetrails/activesupport";
import {
  assertCalled,
  stubAnyInstance,
} from "@blazetrails/activesupport/testing/method-call-assertions";
import { Time } from "@blazetrails/date";
import { SMTP, type Message } from "@blazetrails/mail";
import { afterEach, describe, expect, it } from "vitest";
import { Base } from "../lib/base.js";
import type { MessageDelivery } from "../lib/message-delivery.js";

class I18nTestMailer extends Base {
  static {
    (this as unknown as { configure(b: (c: Configuration) => void): void }).configure((c) => {
      c.set("assetsDir", "");
    });
    this.prependViewPath(
      new FixtureResolver({
        "i18n-test-mailer/mail-with-i18n-subject.tse":
          "Hello there,\n\nMr. <%= this.recipient %>.  Be greeted, new member!\n",
      }),
    );
  }

  declare recipient: string;

  mailWithI18nSubject(recipient: string) {
    this.recipient = recipient;
    I18n.setLocale("de");
    return this.mail({
      to: recipient,
      subject: I18n.t("email_subject"),
      from: "system@loudthinking.com",
      date: Time.local(2004, 12, 12),
    });
  }
}

class TestController extends ActionController.Base {
  async sendMail() {
    const email = (await (
      I18nTestMailer as typeof I18nTestMailer & Record<string, (...a: unknown[]) => MessageDelivery>
    )
      .mailWithI18nSubject("test@localhost")
      .deliverNow()) as Message;
    this.render({ plain: `Mail sent - Subject: ${email.subject()}` });
  }
}
void TestController;

const Routes = new RouteSet();
Routes.draw(function () {
  deprecator().silence(() => {
    this.get(":controller(/:action(/:id))");
  });
});

class RoutedRackApp {
  readonly routes: RouteSet;
  private _stack: { call(env: unknown): unknown };

  constructor(routes: RouteSet, blk?: (stack: MiddlewareStack) => void) {
    this.routes = routes;
    this._stack = new MiddlewareStack(blk).build(this.routes) as { call(env: unknown): unknown };
  }

  call(env: unknown) {
    return this._stack.call(env);
  }
}

const APP = new RoutedRackApp(Routes);

class ActionMailerI18nWithControllerTest extends IntegrationTest {
  override get app() {
    return APP as never;
  }

  async withTranslation(locale: string, data: Record<string, unknown>, block: () => Promise<void>) {
    try {
      I18n.backend().storeTranslations(locale, data);
      await block();
    } finally {
      await I18n.backend().reloadBang();
    }
  }
}

describe("ActionMailerI18nWithControllerTest", () => {
  const t = new ActionMailerI18nWithControllerTest("send mail");

  afterEach(() => {
    I18n.setLocale(I18n.defaultLocale());
  });

  // BLOCKED: stub-any-instance-does-not-intercept-js-new
  it.skip("send mail", async () => {
    await stubAnyInstance(SMTP, { instance: new SMTP({}) }, async (instance) => {
      await assertCalled(instance, "deliverBang", null, {}, async () => {
        await t.withTranslation("de", { email_subject: "[Anmeldung] Willkommen" }, async () => {
          await t.get("/test/send_mail");
          expect(t.response.body).toBe("Mail sent - Subject: [Anmeldung] Willkommen");
        });
      });
    });
  });
});
