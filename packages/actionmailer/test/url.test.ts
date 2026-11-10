import { FixtureResolver } from "@blazetrails/actionview/testing/resolvers";
import { assertDomEqual } from "@blazetrails/actionview/rails-dom-testing/assertions/dom-assertions";
import { assertNothingRaised } from "@blazetrails/activesupport/testing/assertions";
import { ActionController, RouteSet } from "@blazetrails/actionpack";
import type { Configuration } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { Mail, type Message } from "@blazetrails/mail";
import { include } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Base } from "../lib/base.js";
import type { MessageDelivery } from "../lib/message-delivery.js";

class WelcomeController extends ActionController.Base {}
void WelcomeController;

const AppRoutes = new RouteSet();

AppRoutes.draw(function () {
  this.get({ "/welcome": "foo#bar", as: "welcome" });
  this.get({ "/dummy_model": "foo#baz", as: "dummy_model" });
  this.get("/welcome/greeting", { to: "welcome#greeting" });
  this.get("/a/b(/:id)", { to: "a#b" });
});

type Hash = Record<string, unknown>;

class UrlTestMailer extends Base {
  static {
    include(this, AppRoutes.urlHelpers());

    (this as unknown as { defaultUrlOptions: Hash }).defaultUrlOptions.host = "www.basecamphq.com";

    (this as unknown as { configure(b: (c: Configuration) => void): void }).configure((c) => {
      c.set("assetsDir", "");
    });

    this.setMailerName("url_test_mailer");
    this.prependViewPath(
      new FixtureResolver({
        "url-test-mailer/exercise-url-for.tse": "<%= urlFor(this.options) %> <%= this.url %>\n",
        "url-test-mailer/signed-up-with-url.tse":
          'Hello there,\n\nMr. <%= this.recipient %>. Please see our greeting at <%= this._welcomeUrl %> <%= welcomeUrl() %>\n\n<%= imageTag("somelogo.png") %>',
      }),
    );
  }

  declare recipient: string;
  declare _welcomeUrl: string;
  declare options: unknown;
  declare url: string;

  signedUpWithUrl(recipient: string) {
    this.recipient = recipient;
    this._welcomeUrl = (this as unknown as { urlFor(o: Hash): string }).urlFor({
      host: "example.com",
      controller: "welcome",
      action: "greeting",
    });
    return this.mail({
      to: recipient,
      subject: `[Signed up] Welcome ${recipient}`,
      from: "system@loudthinking.com",
      date: Time.local(2004, 12, 12),
    });
  }

  exerciseUrlFor(options: unknown) {
    this.options = options;
    this.url = (this as unknown as { urlFor(o: unknown): string }).urlFor(this.options);
    return this.mail({ from: "from@example.com", to: "to@example.com", subject: "subject" });
  }
}

type Mailer = typeof UrlTestMailer & Record<string, (...args: unknown[]) => MessageDelivery>;

class DummyModel {
  static get modelName() {
    return { routeKey: "dummy_model", name: null };
  }

  isPersisted() {
    return false;
  }

  get modelName() {
    return DummyModel.modelName;
  }

  toModel() {
    return this;
  }
}

describe("ActionMailerUrlTest", () => {
  let recipient: string;

  function newMail(charset: string | null = "UTF-8"): Message {
    const mail = new Mail.Message();
    mail.setMimeVersion("1.0");
    if (charset != null) {
      mail.setContentType(["text", "plain", { charset: charset }]);
    }
    return mail;
  }

  async function assertUrlFor(expected: string, options: unknown, relative = false) {
    if (expected.startsWith("/") && !relative) expected = `http://www.basecamphq.com${expected}`;
    const urls = (await (UrlTestMailer as Mailer).exerciseUrlFor(options).message())
      .body()
      .toString()
      .replace(/\r?\n$/, "")
      .trim()
      .split(/\s+/);

    expect(urls[0]).toBe(expected);
    expect(urls[1]).toBe(expected);
  }

  beforeEach(() => {
    recipient = "test@localhost";
  });

  it("url for", async () => {
    UrlTestMailer.deliveryMethod = "test";

    await assertUrlFor("http://foo/", "http://foo/");

    await assertUrlFor("/welcome", ":welcome");

    await assertUrlFor("/a/b/c", { controller: "a", action: "b", id: "c" });
    await assertUrlFor("/a/b/c", { controller: "a", action: "b", id: "c", onlyPath: true }, true);

    await assertUrlFor("/dummy_model", new DummyModel());

    await assertUrlFor("/dummy_model", DummyModel);

    await assertUrlFor("/dummy_model", [DummyModel]);
  });

  it("signed up with url", async () => {
    UrlTestMailer.deliveryMethod = "test";

    const expected = newMail();
    expected.setTo(recipient);
    expected.setSubject(`[Signed up] Welcome ${recipient}`);
    expected.setBody(
      `Hello there,\n\nMr. ${recipient}. Please see our greeting at http://example.com/welcome/greeting http://www.basecamphq.com/welcome\n\n<img src="/images/somelogo.png" />`,
    );
    expected.setFrom("system@loudthinking.com");
    expected.setDate(Time.local(2004, 12, 12));
    expected.setContentType("text/html");

    let created: Message | null = null;
    await assertNothingRaised(async () => {
      created = await (UrlTestMailer as Mailer).signedUpWithUrl(recipient).message();
    });
    expect(created).not.toBeNull();

    expected.setMessageId("<123@456>");
    created!.setMessageId("<123@456>");
    assertDomEqual(expected.encoded(), created!.encoded());

    await assertNothingRaised(async () => {
      await (UrlTestMailer as Mailer).signedUpWithUrl(recipient).deliverNow();
    });
    expect(Base.deliveries[0]).not.toBeUndefined();
    const delivered = Base.deliveries[0];

    delivered.setMessageId("<123@456>");
    assertDomEqual(expected.encoded(), delivered.encoded());
  });
});
