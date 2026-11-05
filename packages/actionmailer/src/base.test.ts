import type {} from "@blazetrails/vitest-matchers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionView } from "@blazetrails/actionpack";
import { I18n, assertNothingRaised, assertRaises } from "@blazetrails/activesupport";
import type { Field, Message } from "@blazetrails/mail";
import { ArgumentError, RuntimeError, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import type { MessageDelivery } from "./message-delivery.js";
import { BaseMailer as BaseMailerClass } from "./test-helpers/mailers/base-mailer.js";

I18n.setEnforceAvailableLocales(false);

type Mailer<T> = T & Record<string, (...args: unknown[]) => MessageDelivery>;
const BaseMailer = BaseMailerClass as Mailer<typeof BaseMailerClass>;

async function withDefault(
  klass: typeof Base,
  newValues: Record<string, unknown>,
  block: () => Promise<void>,
) {
  const old = klass.defaultParams;
  try {
    klass.default(newValues);
    await block();
  } finally {
    klass.defaultParams = old;
  }
}

async function withTranslation(
  locale: string,
  data: Record<string, unknown>,
  block: () => Promise<void>,
) {
  try {
    I18n.backend().storeTranslations(locale, data);
    await block();
  } finally {
    await I18n.backend().reloadBang();
  }
}

async function swap(klass: typeof I18n, newValues: { locale: string }, block: () => Promise<void>) {
  const old = klass.locale();
  try {
    klass.setLocale(newValues.locale);
    await block();
  } finally {
    klass.setLocale(old);
  }
}

describe("BaseTest", () => {
  let originalDeliveryMethod: typeof Base.deliveryMethod;

  beforeEach(() => {
    originalDeliveryMethod = Base.deliveryMethod;
    Base.deliveryMethod = "test";
  });

  afterEach(() => {
    BaseMailer.deliveries.length = 0;
    Base.deliveryMethod = originalDeliveryMethod;
  });

  it("method call to mail does not raise error", () => {
    assertNothingRaised(() => BaseMailer.welcome());
  });

  it("mail() should set the headers of the mail message", async () => {
    const email = await BaseMailer.welcome().message();
    expect(Array.from(email.to() as string[])).toEqual(["system@test.lindsaar.net"]);
    expect(Array.from(email.from() as string[])).toEqual(["jose@test.plataformatec.com"]);
    expect(Array.from(email.replyTo() as string[])).toEqual(["mikel@test.lindsaar.net"]);
    expect(email.subject()).toBe("The first email on new API!");
  });

  it("mail() with from overwrites the class level default", async () => {
    const email = await BaseMailer.welcome({
      from: "someone@example.com",
      to: "another@example.org",
    }).message();
    expect(Array.from(email.from() as string[])).toEqual(["someone@example.com"]);
    expect(Array.from(email.to() as string[])).toEqual(["another@example.org"]);
  });

  it("mail() renders the template using the method being processed", async () => {
    const email = await BaseMailer.welcome().message();
    expect(email.body().encoded()).toBe("Welcome");
  });

  it("can pass in :body to the mail method hash", async () => {
    const email = await BaseMailer.welcome({ body: "Hello there" }).message();
    expect(email.mimeType()).toBe("text/plain");
    expect(email.body().encoded()).toBe("Hello there");
  });

  it("should set template content type if mail has only one part", async () => {
    let mail = await BaseMailer.htmlOnly().message();
    expect(mail.mimeType()).toBe("text/html");
    mail = await BaseMailer.plainTextOnly().message();
    expect(mail.mimeType()).toBe("text/plain");
  });

  it("mail() using email_address_with_name", async () => {
    const email = await BaseMailer.withName().message();
    expect((email.get("To") as Field).value).toBe("Sunny <sunny@example.com>");
    expect((email.get("Reply-To") as Field).value).toBe("Mikel <mikel@test.lindsaar.net>");
  });

  it("mail() using email_address_with_name with blank string as name", async () => {
    const email = await BaseMailer.withBlankName().message();
    expect((email.get("To") as Field).value).toBe("sunny@example.com");
  });

  it("custom headers", async () => {
    const email = await BaseMailer.welcome().message();
    expect((email.get("X-SPAM") as Field).decoded()).toBe("Not SPAM");
  });

  it("can pass random headers in as a hash to mail", async () => {
    const hash = {
      "X-Special-Domain-Specific-Header": "SecretValue",
      "In-Reply-To": "<1234@mikel.me.com>",
    };
    const mail = await BaseMailer.welcome(hash).message();
    expect((mail.get("X-Special-Domain-Specific-Header") as Field).decoded()).toBe("SecretValue");
    expect((mail.get("In-Reply-To") as Field).decoded()).toBe("<1234@mikel.me.com>");
  });

  it("can pass random headers in as a hash to headers", async () => {
    const hash = {
      "X-Special-Domain-Specific-Header": "SecretValue",
      "In-Reply-To": "<1234@mikel.me.com>",
    };
    const mail = await BaseMailer.welcomeWithHeaders(hash).message();
    expect((mail.get("X-Special-Domain-Specific-Header") as Field).decoded()).toBe("SecretValue");
    expect((mail.get("In-Reply-To") as Field).decoded()).toBe("<1234@mikel.me.com>");
  });

  it("attachment with content", async () => {
    const email = await BaseMailer.attachmentWithContent().message();
    expect(email.attachments().length).toBe(1);
    expect(email.attachments().get(0)!.filename()).toBe("invoice.pdf");
    expect(email.attachments().get("invoice.pdf")!.decoded()).toBe("This is test File content");
  });

  it("attachment gets content type from filename", async () => {
    const email = await BaseMailer.attachmentWithContent().message();
    expect(email.attachments().get(0)!.filename()).toBe("invoice.pdf");
    expect(email.attachments().get(0)!.mimeType()).toBe("application/pdf");
  });

  it("sets mime type to multipart/mixed when attachment is included", async () => {
    const email = await BaseMailer.attachmentWithContent().message();
    expect(email.attachments().length).toBe(1);
    expect(email.mimeType()).toBe("multipart/mixed");
  });

  it("set mime type to text/html when attachment is included and body is set", async () => {
    const email = await BaseMailer.attachmentWithContent({
      body: "Hello there",
      contentType: "text/html",
    }).message();
    expect(email.mimeType()).toBe("text/html");
  });

  it("adds the rendered template as part", async () => {
    const email = await BaseMailer.attachmentWithContent().message();
    expect(email.parts.length).toBe(2);
    expect(email.mimeType()).toBe("multipart/mixed");
    expect(email.parts[0].mimeType()).toBe("text/html");
    expect(email.parts[0].decoded()).toBe("Attachment with content");
    expect(email.parts[1].mimeType()).toBe("application/pdf");
    expect(email.parts[1].decoded()).toBe("This is test File content");
  });

  it("adds the given :body as part", async () => {
    const email = await BaseMailer.attachmentWithContent({ body: "I'm the eggman" }).message();
    expect(email.parts.length).toBe(2);
    expect(email.mimeType()).toBe("multipart/mixed");
    expect(email.parts[0].mimeType()).toBe("text/plain");
    expect(email.parts[0].decoded()).toBe("I'm the eggman");
    expect(email.parts[1].mimeType()).toBe("application/pdf");
    expect(email.parts[1].decoded()).toBe("This is test File content");
  });

  it("uses default charset from class", async () => {
    await withDefault(BaseMailer, { charset: "US-ASCII" }, async () => {
      let email = await BaseMailer.welcome().message();
      expect(email.charset).toBe("US-ASCII");

      email = await BaseMailer.welcome({ charset: "iso-8559-1" }).message();
      expect(email.charset).toBe("iso-8559-1");
    });
  });

  it("uses default content type from class", async () => {
    await withDefault(BaseMailer, { contentType: "text/html" }, async () => {
      let email = await BaseMailer.welcome().message();
      expect(email.mimeType()).toBe("text/html");

      email = await BaseMailer.welcome({ contentType: "text/plain" }).message();
      expect(email.mimeType()).toBe("text/plain");
    });
  });

  it("uses default mime version from class", async () => {
    await withDefault(BaseMailer, { mimeVersion: "2.0" }, async () => {
      let email = await BaseMailer.welcome().message();
      expect(email.mimeVersion()).toBe("2.0");

      email = await BaseMailer.welcome({ mimeVersion: "1.0" }).message();
      expect(email.mimeVersion()).toBe("1.0");
    });
  });

  it("uses random default headers from class", async () => {
    await withDefault(BaseMailer, { "X-Custom": "Custom" }, async () => {
      const email = await BaseMailer.welcome().message();
      expect((email.get("X-Custom") as Field).decoded()).toBe("Custom");
    });
  });

  it("subject gets default from I18n", async () => {
    await withDefault(BaseMailer, { subject: null }, async () => {
      let email = await BaseMailer.welcome({ subject: null }).message();
      expect(email.subject()).toBe("Welcome");

      await withTranslation(
        "en",
        { base_mailer: { welcome: { subject: "New Subject!" } } },
        async () => {
          email = await BaseMailer.welcome({ subject: null }).message();
          expect(email.subject()).toBe("New Subject!");
        },
      );
    });
  });

  it("default subject can have interpolations", async () => {
    await withTranslation(
      "en",
      {
        base_mailer: {
          withSubjectInterpolations: {
            subject: "Will the real %{rapperOrImpersonator} please stand up?",
          },
        },
      },
      async () => {
        const email = await BaseMailer.withSubjectInterpolations().message();
        expect(email.subject()).toBe("Will the real Slim Shady please stand up?");
      },
    );
  });

  it("translations are scoped properly", async () => {
    await withTranslation(
      "en",
      { "base-mailer": { "email-with-translations": { greet_user: "Hello %{name}!" } } },
      async () => {
        const email = await BaseMailer.emailWithTranslations().message();
        expect(email.body().encoded()).toBe("Hello lifo!");
      },
    );
  });

  it("adding attachments after mail was called raises exception", async () => {
    class LateAttachmentMailer extends Base {
      async welcome() {
        await this.mail({ body: "yay", from: "welcome@example.com", to: "to@example.com" });
        return this.attachments().set("invoice.pdf", "This is test File content");
      }
    }

    const e = await assertRaises([RuntimeError], {}, () =>
      (LateAttachmentMailer as Mailer<typeof LateAttachmentMailer>).welcome().message(),
    );
    expect(e.message).toMatch(/Can't add attachments after `mail` was called./);
  });

  it("adding inline attachments after mail was called raises exception", async () => {
    class LateInlineAttachmentMailer extends Base {
      async welcome() {
        await this.mail({ body: "yay", from: "welcome@example.com", to: "to@example.com" });
        return this.attachments().inline().set("invoice.pdf", "This is test File content");
      }
    }

    const e = await assertRaises([RuntimeError], {}, () =>
      (LateInlineAttachmentMailer as Mailer<typeof LateInlineAttachmentMailer>).welcome().message(),
    );
    expect(e.message).toMatch(/Can't add attachments after `mail` was called./);
  });

  it("accessing inline attachments after mail was called works", async () => {
    class LateInlineAttachmentAccessorMailer extends Base {
      async welcome() {
        await this.mail({ body: "yay", from: "welcome@example.com", to: "to@example.com" });
        return this.attachments().inline().get("invoice.pdf");
      }
    }

    await assertNothingRaised(() =>
      (LateInlineAttachmentAccessorMailer as Mailer<typeof LateInlineAttachmentAccessorMailer>)
        .welcome()
        .message(),
    );
  });

  it("implicit multipart", async () => {
    const email = await BaseMailer.implicitMultipart().message();
    expect(email.parts.length).toBe(2);
    expect(email.mimeType()).toBe("multipart/alternative");
    expect(email.parts[0].mimeType()).toBe("text/plain");
    expect(email.parts[0].body().encoded()).toBe("TEXT Implicit Multipart");
    expect(email.parts[1].mimeType()).toBe("text/html");
    expect(email.parts[1].body().encoded()).toBe("HTML Implicit Multipart");
  });

  it("implicit multipart formats", async () => {
    const email = await BaseMailer.implicitMultipartFormats().message();
    expect(email.parts.length).toBe(2);
    expect(email.mimeType()).toBe("multipart/alternative");
    expect(email.parts[0].mimeType()).toBe("text/plain");
    expect(email.parts[0].body().encoded()).toBe("Implicit Multipart [:text]");
    expect(email.parts[1].mimeType()).toBe("text/html");
    expect(email.parts[1].body().encoded()).toBe("Implicit Multipart [:html]");
  });

  it("implicit multipart with sort order", async () => {
    const order = ["text/html", "text/plain"];
    await withDefault(BaseMailer, { partsOrder: order }, async () => {
      let email = await BaseMailer.implicitMultipart().message();
      expect(email.parts[0].mimeType()).toBe("text/html");
      expect(email.parts[1].mimeType()).toBe("text/plain");

      email = await BaseMailer.implicitMultipart({ partsOrder: [...order].reverse() }).message();
      expect(email.parts[0].mimeType()).toBe("text/plain");
      expect(email.parts[1].mimeType()).toBe("text/html");
    });
  });

  it("implicit multipart with attachments creates nested parts", async () => {
    const email = await BaseMailer.implicitMultipart({ attachments: true }).message();
    expect(email.parts.map((p) => p.mimeType()).sort()).toEqual([
      "application/pdf",
      "multipart/alternative",
    ]);
    const multipart = email.parts.find((p) => p.mimeType() === "multipart/alternative")!;
    expect(multipart.parts[0].mimeType()).toBe("text/plain");
    expect(multipart.parts[0].body().encoded()).toBe("TEXT Implicit Multipart");
    expect(multipart.parts[1].mimeType()).toBe("text/html");
    expect(multipart.parts[1].body().encoded()).toBe("HTML Implicit Multipart");
  });

  it("implicit multipart with attachments and sort order", async () => {
    const order = ["text/html", "text/plain"];
    await withDefault(BaseMailer, { partsOrder: order }, async () => {
      const email = await BaseMailer.implicitMultipart({ attachments: true }).message();
      expect(email.parts.map((p) => p.mimeType()).sort()).toEqual([
        "application/pdf",
        "multipart/alternative",
      ]);
      const multipart = email.parts.find((p) => p.mimeType() === "multipart/alternative")!;
      expect(multipart.parts.map((p) => p.mimeType()).sort()).toEqual(["text/html", "text/plain"]);
    });
  });

  it("implicit multipart with default locale", async () => {
    const email = await BaseMailer.implicitWithLocale().message();
    expect(email.parts.length).toBe(2);
    expect(email.mimeType()).toBe("multipart/alternative");
    expect(email.parts[0].mimeType()).toBe("text/plain");
    expect(email.parts[0].body().encoded()).toBe("Implicit with locale TEXT");
    expect(email.parts[1].mimeType()).toBe("text/html");
    expect(email.parts[1].body().encoded()).toBe("Implicit with locale EN HTML");
  });

  it("implicit multipart with other locale", async () => {
    await swap(I18n, { locale: "pl" }, async () => {
      const email = await BaseMailer.implicitWithLocale().message();
      expect(email.parts.length).toBe(2);
      expect(email.mimeType()).toBe("multipart/alternative");
      expect(email.parts[0].mimeType()).toBe("text/plain");
      expect(email.parts[0].body().encoded()).toBe("Implicit with locale PL TEXT");
      expect(email.parts[1].mimeType()).toBe("text/html");
      expect(email.parts[1].body().encoded()).toBe("Implicit with locale EN HTML");
    });
  });

  it("explicit multipart", async () => {
    const email = await BaseMailer.explicitMultipart().message();
    expect(email.parts.length).toBe(2);
    expect(email.mimeType()).toBe("multipart/alternative");
    expect(email.parts[0].mimeType()).toBe("text/plain");
    expect(email.parts[0].body().encoded()).toBe("TEXT Explicit Multipart");
    expect(email.parts[1].mimeType()).toBe("text/html");
    expect(email.parts[1].body().encoded()).toBe("HTML Explicit Multipart");
  });

  it("explicit multipart have a boundary", async () => {
    const mail = await BaseMailer.explicitMultipart().message();
    expect(mail.contentTypeParameters()!.get("boundary")).not.toBeNull();
  });

  it("explicit multipart with attachments creates nested parts", async () => {
    const email = await BaseMailer.explicitMultipart({ attachments: true }).message();
    expect(email.parts.map((p) => p.mimeType()).sort()).toEqual([
      "application/pdf",
      "multipart/alternative",
    ]);
    const multipart = email.parts.find((p) => p.mimeType() === "multipart/alternative")!;
    expect(multipart.parts[0].mimeType()).toBe("text/plain");
    expect(multipart.parts[0].body().encoded()).toBe("TEXT Explicit Multipart");
    expect(multipart.parts[1].mimeType()).toBe("text/html");
    expect(multipart.parts[1].body().encoded()).toBe("HTML Explicit Multipart");
  });

  it("explicit multipart with templates", async () => {
    const email = await BaseMailer.explicitMultipartTemplates().message();
    expect(email.parts.length).toBe(2);
    expect(email.mimeType()).toBe("multipart/alternative");
    expect(email.parts[0].mimeType()).toBe("text/plain");
    expect(email.parts[0].body().encoded()).toBe("TEXT Explicit Multipart Templates");
    expect(email.parts[1].mimeType()).toBe("text/html");
    expect(email.parts[1].body().encoded()).toBe("HTML Explicit Multipart Templates");
  });

  it("explicit multipart with format.any", async () => {
    const email = await BaseMailer.explicitMultipartWithAny().message();
    expect(email.parts.length).toBe(2);
    expect(email.mimeType()).toBe("multipart/alternative");
    expect(email.parts[0].mimeType()).toBe("text/plain");
    expect(email.parts[0].body().encoded()).toBe("Format with any!");
    expect(email.parts[1].mimeType()).toBe("text/html");
    expect(email.parts[1].body().encoded()).toBe("Format with any!");
  });

  it("explicit without specifying format with format.any", async () => {
    const error = await assertRaises([ArgumentError], {}, () =>
      BaseMailer.explicitWithoutSpecifyingFormatWithAny().message(),
    );
    expect(error.message).toBe("You have to supply at least one format");
  });

  // BLOCKED: mailer-collector-renders-each-format-before-the-next-is-set
  it.skip("explicit multipart with one template has the expected format", async () => {
    const email = await BaseMailer.explicitMultipartWithOneTemplate().message();
    expect(email.parts.length).toBe(2);
    expect(email.mimeType()).toBe("multipart/alternative");
    expect(email.parts[0].mimeType()).toBe("text/plain");
    expect(email.parts[0].body().encoded()).toBe("[:text]");
    expect(email.parts[1].mimeType()).toBe("text/html");
    expect(email.parts[1].body().encoded()).toBe("[:html]");
  });

  it("explicit multipart with sort order", async () => {
    const order = ["text/html", "text/plain"];
    await withDefault(BaseMailer, { partsOrder: order }, async () => {
      let email = await BaseMailer.explicitMultipart().message();
      expect(email.parts[0].mimeType()).toBe("text/html");
      expect(email.parts[1].mimeType()).toBe("text/plain");

      email = await BaseMailer.explicitMultipart({ partsOrder: [...order].reverse() }).message();
      expect(email.parts[0].mimeType()).toBe("text/plain");
      expect(email.parts[1].mimeType()).toBe("text/html");
    });
  });

  it("should respond to action methods", () => {
    expect(BaseMailer).toRespondTo("welcome");
    expect(BaseMailer).toRespondTo("implicitMultipart");
    expect(BaseMailer).not.toRespondTo("mail");
    expect(BaseMailer).not.toRespondTo("headers");
  });

  it("calling just the action should return the generated mail object", async () => {
    const email = await BaseMailer.welcome().message();
    expect(BaseMailer.deliveries.length).toBe(0);
    expect(email.subject()).toBe("The first email on new API!");
  });

  it("calling deliver on the action should increment the deliveries collection if using the test mailer", async () => {
    await BaseMailer.welcome().deliverNow();
    expect(BaseMailer.deliveries.length).toBe(1);
  });

  it("you can specify a different template for implicit render", async () => {
    const mail = (await BaseMailer.implicitDifferentTemplate(
      "implicit-multipart",
    ).deliverNow()) as Message;
    expect(mail.htmlPart()!.body().decoded()).toBe("HTML Implicit Multipart");
    expect(mail.textPart()!.body().decoded()).toBe("TEXT Implicit Multipart");
  });

  it("you can specify a different template for multipart render", async () => {
    const mail = (await BaseMailer.implicitDifferentTemplateWithBlock(
      "explicit-multipart-templates",
    ).deliverNow()) as Message;
    expect(mail.htmlPart()!.body().decoded()).toBe("HTML Explicit Multipart Templates");
    expect(mail.textPart()!.body().decoded()).toBe("TEXT Explicit Multipart Templates");
  });

  it("should raise if missing template in implicit render", async () => {
    await assertRaises([ActionView.MissingTemplate], {}, () =>
      BaseMailer.implicitDifferentTemplate("missing-template").deliverNow(),
    );
    expect(BaseMailer.deliveries.length).toBe(0);
  });

  it("you can specify a different template for explicit render", async () => {
    const mail = (await BaseMailer.explicitDifferentTemplate(
      "explicit-multipart-templates",
    ).deliverNow()) as Message;
    expect(mail.htmlPart()!.body().decoded()).toBe("HTML Explicit Multipart Templates");
    expect(mail.textPart()!.body().decoded()).toBe("TEXT Explicit Multipart Templates");
  });

  it("you can specify a different layout", async () => {
    const mail = (await BaseMailer.differentLayout("different-layout").deliverNow()) as Message;
    expect(mail.htmlPart()!.body().decoded()).toBe("HTML -- HTML");
    expect(mail.textPart()!.body().decoded()).toBe("PLAIN -- PLAIN");
  });

  it("the view is not rendered when mail was never called", async () => {
    const mail = BaseMailer.withoutMailCall();
    expect((await mail.message()).body().toString().trim()).toBe("");
    await mail.deliverNow();
  });

  it("the return value of mailer methods is not relevant", async () => {
    const mail = BaseMailer.withNilAsReturnValue();
    expect((await mail.message()).body().toString().trim()).toBe("Welcome");
    await mail.deliverNow();
  });

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
