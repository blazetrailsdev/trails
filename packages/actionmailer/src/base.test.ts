import type {} from "@blazetrails/vitest-matchers";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ActionView } from "@blazetrails/actionpack";
import { DateTime, Time, strftime } from "@blazetrails/date";
import {
  ExecutionContext,
  I18n,
  Notifications,
  assertCalled,
  assertCalledWith,
  assertNotCalled,
  assertNothingRaised,
  assertRaises,
  days,
  stub,
} from "@blazetrails/activesupport";
import type { AddressContainer, Field, Message } from "@blazetrails/mail";
import {
  ArgumentError,
  RuntimeError,
  TopLevel,
  constSet,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { Preview } from "./preview.js";
import type { MessageDelivery } from "./message-delivery.js";
import { Preview } from "./preview.js";
import { BaseMailer as BaseMailerClass } from "./test-helpers/mailers/base-mailer.js";
import { ProcMailer as ProcMailerClass } from "./test-helpers/mailers/proc-mailer.js";

I18n.setEnforceAvailableLocales(false);

type Event = { name: string; payload: Record<string, unknown> };
type ActionCallbacks = Record<"beforeAction" | "afterAction", (name: string) => void>;
type Mailer<T> = T & Record<string, (...args: unknown[]) => MessageDelivery>;
const BaseMailer = BaseMailerClass as Mailer<typeof BaseMailerClass>;
const ProcMailer = ProcMailerClass as Mailer<typeof ProcMailerClass>;

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

class MyObserver {
  static deliveredEmail(_mail: Message): void {}
}

class MySecondObserver {
  static deliveredEmail(_mail: Message): void {}
}

class MyInterceptor {
  static deliveringEmail(_mail: Message): void {}
  static previewingEmail(_mail: Message): void {}
}

class MySecondInterceptor {
  static deliveringEmail(_mail: Message): void {}
  static previewingEmail(_mail: Message): void {}
}

const BaseTestNamespace = {};
constSet(TopLevel, "BaseTest", BaseTestNamespace);
constSet(BaseTestNamespace, "MyObserver", MyObserver);
constSet(BaseTestNamespace, "MyInterceptor", MyInterceptor);

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

  it("mail() with bcc, cc, content_type, charset, mime_version, reply_to and date", async () => {
    const time = DateTime.parse(strftime(DateTime.now(), "%Y-%m-%d 00:00:00 %z"));
    const email = await BaseMailer.welcome({
      bcc: "bcc@test.lindsaar.net",
      cc: "cc@test.lindsaar.net",
      contentType: "multipart/mixed",
      charset: "iso-8559-1",
      mimeVersion: "2.0",
      replyTo: "reply-to@test.lindsaar.net",
      date: time,
    }).message();
    expect(Array.from(email.bcc() as string[])).toEqual(["bcc@test.lindsaar.net"]);
    expect(Array.from(email.cc() as string[])).toEqual(["cc@test.lindsaar.net"]);
    expect(email.contentType()).toBe("multipart/mixed; charset=iso-8559-1");
    expect(email.charset).toBe("iso-8559-1");
    expect(email.mimeVersion()).toBe("2.0");
    expect(Array.from(email.replyTo() as string[])).toEqual(["reply-to@test.lindsaar.net"]);
    expect((email.date() as DateTime).equals(time)).toBe(true);
  });

  it("mail() renders the template using the method being processed", async () => {
    const email = await BaseMailer.welcome().message();
    expect(email.body().encoded()).toBe("Welcome");
  });

  it("mail() doesn't set the mailer as a controller in the execution context", async () => {
    ExecutionContext.clear();
    expect(ExecutionContext.toH().controller).toBeUndefined();
    (
      await BaseMailer.welcome({ from: "someone@example.com", to: "another@example.org" }).message()
    ).to();
    expect(ExecutionContext.toH().controller).toBeUndefined();
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

  it("attachment with hash", async () => {
    const email = await BaseMailer.attachmentWithHash().message();
    expect(email.attachments().length).toBe(1);
    expect(email.attachments().get(0)!.filename()).toBe("invoice.jpg");
    const expected = new Uint8Array([0xca, 0x8b, 0xac, 0x9a, 0x29, 0x62]);
    expect(email.attachments().get("invoice.jpg")!.decoded()).toEqual(expected);
  });

  it("attachment with hash using default mail encoding", async () => {
    const email = await BaseMailer.attachmentWithHashDefaultEncoding().message();
    expect(email.attachments().length).toBe(1);
    expect(email.attachments().get(0)!.filename()).toBe("invoice.jpg");
    const expected = new Uint8Array([0xca, 0x8b, 0xac, 0x9a, 0x29, 0x62]);
    expect(email.attachments().get("invoice.jpg")!.decoded()).toEqual(expected);
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

  it("can embed an inline attachment", async () => {
    const email = await BaseMailer.inlineAttachment().message();
    email.encoded();
    expect(email.parts.length).toBe(2);
    expect(email.mimeType()).toBe("multipart/related");
    expect(email.parts[0].mimeType()).toBe("multipart/alternative");
    expect(email.parts[0].parts[0].mimeType()).toBe("text/plain");
    expect(email.parts[0].parts[1].mimeType()).toBe("text/html");
    expect(email.parts[1].filename()).toBe("logo.png");
  });

  it("can embed an inline attachment and other attachments", async () => {
    const email = await BaseMailer.inlineAndOtherAttachments().message();
    email.encoded();
    expect(email.parts.length).toBe(2);
    expect(email.mimeType()).toBe("multipart/mixed");
    expect(email.parts[0].mimeType()).toBe("multipart/related");
    expect(email.parts[0].parts[0].mimeType()).toBe("multipart/alternative");
    expect(email.parts[0].parts[0].parts[0].mimeType()).toBe("text/plain");
    expect(email.parts[0].parts[0].parts[1].mimeType()).toBe("text/html");
    expect(email.parts[0].parts[1].filename()).toBe("logo.png");
    expect(email.parts[1].filename()).toBe("certificate.pdf");
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

  it("accessing attachments works after mail was called", async () => {
    class LateAttachmentAccessorMailer extends Base {
      async welcome() {
        await this.attachments().set("invoice.pdf", "This is test File content");
        await this.mail({ body: "yay", from: "welcome@example.com", to: "to@example.com" });

        if (
          JSON.stringify(this.attachments().map((a) => a.filename())) !==
          JSON.stringify(["invoice.pdf"])
        ) {
          throw new Error("Should allow access to attachments");
        }
      }
    }

    await assertNothingRaised(() =>
      (LateAttachmentAccessorMailer as Mailer<typeof LateAttachmentAccessorMailer>)
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
    expect([...email.parts.map((p) => p.mimeType()).sort()]).toEqual([
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
      expect([...email.parts.map((p) => p.mimeType()).sort()]).toEqual([
        "application/pdf",
        "multipart/alternative",
      ]);
      const multipart = email.parts.find((p) => p.mimeType() === "multipart/alternative")!;
      expect([...multipart.parts.map((p) => p.mimeType()).sort()]).toEqual([
        "text/html",
        "text/plain",
      ]);
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
    expect([...email.parts.map((p) => p.mimeType()).sort()]).toEqual([
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

  it("explicit multipart with format(Hash)", async () => {
    const email = await BaseMailer.explicitMultipartWithOptions(true).message();
    email.readyToSendBang();
    expect(email.parts.length).toBe(2);
    expect(email.mimeType()).toBe("multipart/alternative");
    expect(email.parts[0].mimeType()).toBe("text/plain");
    expect(email.parts[0].contentTransferEncoding()).toBe("base64");
    expect(email.parts[1].mimeType()).toBe("text/html");
    expect(email.parts[1].contentTransferEncoding()).toBe("7bit");
  });

  it("explicit multipart with one part is rendered as body and options are merged", async () => {
    const email = await BaseMailer.explicitMultipartWithOptions().message();
    expect(email.parts.length).toBe(0);
    expect(email.mimeType()).toBe("text/plain");
    expect(email.contentTransferEncoding()).toBe("base64");
  });

  it("explicit multipart with one template has the expected format", async () => {
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

  it("calling deliver on the action should deliver the mail object", async () => {
    await assertCalled(BaseMailer, "deliverMail", null, {}, async () => {
      const mail = (await BaseMailer.welcome().deliverNow()) as Message;
      expect(mail.subject()).toBe("The first email on new API!");
    });
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

  it("you can register and unregister an observer to the mail object that gets informed on email delivery", async () => {
    Base.registerObserver(MyObserver);
    try {
      const mail = BaseMailer.welcome();
      const message = await mail.message();
      await assertCalledWith(MyObserver, "deliveredEmail", [message], {}, async () => {
        await mail.deliverNow();
      });

      Base.unregisterObserver(MyObserver);
      await assertNotCalled(MyObserver, "deliveredEmail", null, async () => {
        await mail.deliverNow();
      });
    } finally {
      Base.unregisterObserver(MyObserver);
    }
  });

  it("you can register and unregister an observer using its stringified name to the mail object that gets informed on email delivery", async () => {
    Base.registerObserver("BaseTest::MyObserver");
    try {
      const mail = BaseMailer.welcome();
      const message = await mail.message();
      await assertCalledWith(MyObserver, "deliveredEmail", [message], {}, async () => {
        await mail.deliverNow();
      });

      Base.unregisterObserver("BaseTest::MyObserver");
      await assertNotCalled(MyObserver, "deliveredEmail", null, async () => {
        await mail.deliverNow();
      });
    } finally {
      Base.unregisterObserver("BaseTest::MyObserver");
    }
  });

  it("you can register and unregister an observer using its symbolized underscored name to the mail object that gets informed on email delivery", async () => {
    Base.registerObserver("base_test/my_observer");
    try {
      const mail = BaseMailer.welcome();
      const message = await mail.message();
      await assertCalledWith(MyObserver, "deliveredEmail", [message], {}, async () => {
        await mail.deliverNow();
      });

      Base.unregisterObserver("base_test/my_observer");
      await assertNotCalled(MyObserver, "deliveredEmail", null, async () => {
        await mail.deliverNow();
      });
    } finally {
      Base.unregisterObserver("base_test/my_observer");
    }
  });

  it("you can register and unregister multiple observers to the mail object that both get informed on email delivery", async () => {
    Base.registerObservers("BaseTest::MyObserver", MySecondObserver);
    try {
      const mail = BaseMailer.welcome();
      const message = await mail.message();
      await assertCalledWith(MyObserver, "deliveredEmail", [message], {}, async () => {
        await assertCalledWith(MySecondObserver, "deliveredEmail", [message], {}, async () => {
          await mail.deliverNow();
        });
      });

      Base.unregisterObservers("BaseTest::MyObserver", MySecondObserver);
      await assertNotCalled(MyObserver, "deliveredEmail", null, async () => {
        await mail.deliverNow();
      });
      await assertNotCalled(MySecondObserver, "deliveredEmail", null, async () => {
        await mail.deliverNow();
      });
    } finally {
      Base.unregisterObservers("BaseTest::MyObserver", MySecondObserver);
    }
  });

  it("you can register and unregister an interceptor to the mail object that gets passed the mail object before delivery", async () => {
    Base.registerInterceptor(MyInterceptor);
    try {
      const mail = BaseMailer.welcome();
      const message = await mail.message();
      await assertCalledWith(MyInterceptor, "deliveringEmail", [message], {}, async () => {
        await mail.deliverNow();
      });

      Base.unregisterInterceptor(MyInterceptor);
      await assertNotCalled(MyInterceptor, "deliveringEmail", null, async () => {
        await mail.deliverNow();
      });
    } finally {
      Base.unregisterInterceptor(MyInterceptor);
    }
  });

  it("you can register and unregister an interceptor using its stringified name to the mail object that gets passed the mail object before delivery", async () => {
    Base.registerInterceptor("BaseTest::MyInterceptor");
    try {
      const mail = BaseMailer.welcome();
      const message = await mail.message();
      await assertCalledWith(MyInterceptor, "deliveringEmail", [message], {}, async () => {
        await mail.deliverNow();
      });

      Base.unregisterInterceptor("BaseTest::MyInterceptor");
      await assertNotCalled(MyInterceptor, "deliveringEmail", null, async () => {
        await mail.deliverNow();
      });
    } finally {
      Base.unregisterInterceptor("BaseTest::MyInterceptor");
    }
  });

  it("you can register and unregister an interceptor using its symbolized underscored name to the mail object that gets passed the mail object before delivery", async () => {
    Base.registerInterceptor("base_test/my_interceptor");
    try {
      const mail = BaseMailer.welcome();
      const message = await mail.message();
      await assertCalledWith(MyInterceptor, "deliveringEmail", [message], {}, async () => {
        await mail.deliverNow();
      });

      Base.unregisterInterceptor("base_test/my_interceptor");
      await assertNotCalled(MyInterceptor, "deliveringEmail", null, async () => {
        await mail.deliverNow();
      });
    } finally {
      Base.unregisterInterceptor("base_test/my_interceptor");
    }
  });

  it("you can register and unregister multiple interceptors to the mail object that both get passed the mail object before delivery", async () => {
    Base.registerInterceptors("BaseTest::MyInterceptor", MySecondInterceptor);
    try {
      const mail = BaseMailer.welcome();
      const message = await mail.message();
      await assertCalledWith(MyInterceptor, "deliveringEmail", [message], {}, async () => {
        await assertCalledWith(MySecondInterceptor, "deliveringEmail", [message], {}, async () => {
          await mail.deliverNow();
        });
      });

      Base.unregisterInterceptors("BaseTest::MyInterceptor", MySecondInterceptor);
      await assertNotCalled(MyInterceptor, "deliveringEmail", null, async () => {
        await mail.deliverNow();
      });
      await assertNotCalled(MySecondInterceptor, "deliveringEmail", null, async () => {
        await mail.deliverNow();
      });
    } finally {
      Base.unregisterInterceptors("BaseTest::MyInterceptor", MySecondInterceptor);
    }
  });

  it("being able to put proc's into the defaults hash and they get evaluated on mail sending", async () => {
    const mail1 = (await ProcMailer.welcome().message()).get("X-Proc-Method");
    const yesterday = days(1).ago(Time.now());
    await stub(Time, "now", yesterday, [], async () => {
      const mail2 = (await ProcMailer.welcome().message()).get("X-Proc-Method");
      expect(Number(String(mail1)) > Number(String(mail2))).toBeTruthy();
    });
  });

  it("default values which have to_proc (e.g. symbols) should not be considered procs", async () => {
    expect(
      String((await ProcMailer.welcome().message()).get("x-has-to-proc")) === "symbol",
    ).toBeTruthy();
  });

  it("proc default values can have arity of 1 where arg is a mailer instance", async () => {
    expect(String((await ProcMailer.welcome().message()).get("X-Lambda-Arity-1-arg"))).toBe(
      "complex_value",
    );
    expect(String((await ProcMailer.welcome().message()).get("X-Lambda-Arity-1-self"))).toBe(
      "complex_value",
    );
  });

  it("proc default values with fixed arity of 0 can be called", async () => {
    expect(String((await ProcMailer.welcome().message()).get("X-Lambda-Arity-0"))).toBe("0");
  });

  it("we can call other defined methods on the class as needed", async () => {
    const mail = await ProcMailer.welcome().message();
    expect(mail.subject()).toBe("Thanks for signing up this afternoon");
  });

  it("proc default values are not evaluated when overridden", async () => {
    const flunk = () => {
      throw new Error("Epic Fail!");
    };
    await withDefault(BaseMailer, { from: () => flunk(), to: () => flunk() }, async () => {
      const email = await BaseMailer.welcome({
        from: "overridden-from@example.com",
        to: "overridden-to@example.com",
      }).message();
      expect(Array.from(email.from() as string[])).toEqual(["overridden-from@example.com"]);
      expect(Array.from(email.to() as string[])).toEqual(["overridden-to@example.com"]);
    });
  });

  it("modifying the mail message with a before_action", async () => {
    class BeforeActionMailer extends Base {
      static {
        (this as unknown as ActionCallbacks).beforeAction(":addSpecialHeaderBang");
        this.prependViewPath(
          new ActionView.FixtureResolver({ "before-action-mailer/welcome.html.tse": "" }),
        );
      }

      welcome() {
        return this.mail();
      }

      /** @internal */
      private addSpecialHeaderBang() {
        this.headers({ "X-Special-Header": "Wow, so special" });
      }
    }

    const mail = await (BeforeActionMailer as Mailer<typeof BeforeActionMailer>)
      .welcome()
      .message();
    expect(String(mail.get("X-Special-Header"))).toBe("Wow, so special");
  });

  it("modifying the mail message with an after_action", async () => {
    class AfterActionMailer extends Base {
      static {
        (this as unknown as ActionCallbacks).afterAction(":addSpecialHeaderBang");
        this.prependViewPath(
          new ActionView.FixtureResolver({ "after-action-mailer/welcome.html.tse": "" }),
        );
      }

      welcome() {
        return this.mail();
      }

      /** @internal */
      private addSpecialHeaderBang() {
        this.headers({ "X-Special-Header": "Testing" });
      }
    }

    const mail = await (AfterActionMailer as Mailer<typeof AfterActionMailer>).welcome().message();
    expect(String(mail.get("X-Special-Header"))).toBe("Testing");
  });

  it("adding an inline attachment using a before_action", async () => {
    class DefaultInlineAttachmentMailer extends Base {
      static {
        (this as unknown as ActionCallbacks).beforeAction(":addInlineAttachmentBang");
        this.prependViewPath(
          new ActionView.FixtureResolver({
            "default-inline-attachment-mailer/welcome.html.tse": "",
          }),
        );
      }

      welcome() {
        return this.mail();
      }

      /** @internal */
      private async addInlineAttachmentBang() {
        await this.attachments().inline().set("footer.jpg", "hey there");
      }
    }

    const mail = await (
      DefaultInlineAttachmentMailer as Mailer<typeof DefaultInlineAttachmentMailer>
    )
      .welcome()
      .message();
    expect(String(mail.attachments().inline()[0].get("Content-Type"))).toBe(
      "image/jpeg; filename=footer.jpg",
    );
  });

  it("action methods should be refreshed after defining new method", () => {
    class FooMailer extends Base {
      static {
        rbObjRespondTo(this, "foo");
      }

      notify() {}
    }

    expect(FooMailer.actionMethods()).toEqual(new Set(["notify"]));
  });

  it("email_address_with_name escapes", () => {
    const address = BaseMailer.emailAddressWithName("test@example.org", 'I "<3" email');
    expect(address).toBe('"I \\"<3\\" email" <test@example.org>');
  });

  it("mailer can be anonymous", async () => {
    const mailer = (() =>
      class extends Base {
        static {
          this.prependViewPath(
            new ActionView.FixtureResolver({ "anonymous/welcome.tse": "Anonymous mailer body\n" }),
          );
        }

        welcome() {
          return this.mail();
        }
      })() as unknown as Mailer<typeof Base>;

    expect(mailer.mailerName()).toBe("anonymous");

    expect((await mailer.welcome().message()).subject()).toBe("Welcome");
    expect(((await mailer.welcome().message()).body().encoded() as string).trim()).toBe(
      "Anonymous mailer body",
    );
  });

  it("default_from can be set", async () => {
    class DefaultFromMailer extends Base {
      static {
        this.default({ to: "system@test.lindsaar.net" });
        this.defaultOptions = { from: "robert.pankowecki@gmail.com" };
      }

      welcome() {
        return this.mail({ subject: "subject", body: "hello world" });
      }
    }

    const mail = await (DefaultFromMailer as Mailer<typeof DefaultFromMailer>).welcome().message();
    expect(Array.from(mail.from() as string[])).toEqual(["robert.pankowecki@gmail.com"]);
  });

  it("mail() without arguments serves as getter for the current mail message", async () => {
    class MailerWithCallback extends Base {
      static {
        (this as unknown as ActionCallbacks).afterAction(":aCallback");
      }

      welcome() {
        this.headers({ "X-Special-Header": "special indeed!" });
        return this.mail({ subject: "subject", body: "hello world", to: ["joe@example.com"] });
      }

      async aCallback() {
        ((await this.mail()).to() as AddressContainer).append("jane@example.com");
      }
    }

    const mail = await (MailerWithCallback as Mailer<typeof MailerWithCallback>)
      .welcome()
      .message();
    expect(mail.subject()).toBe("subject");
    expect(Array.from(mail.to() as string[])).toEqual(["joe@example.com", "jane@example.com"]);
    expect((mail.body().encoded() as string).trim()).toBe("hello world");
    expect(String(mail.get("X-Special-Header"))).toBe("special indeed!");
  });

  it("notification for process", async () => {
    const events: Event[] = [];
    Notifications.subscribe("process.action_mailer", (event: Event) => events.push(event));
    try {
      await BaseMailer.welcome({ body: "Hello there" }).deliverNow();

      expect(events.length).toBe(1);
      expect(events[0].name).toBe("process.action_mailer");
      expect(events[0].payload.mailer).toBe("BaseMailer");
      expect(events[0].payload.action).toBe("welcome");
      expect(events[0].payload.args).toEqual([{ body: "Hello there" }]);
    } finally {
      Notifications.unsubscribe("process.action_mailer");
    }
  });

  it("notification for deliver", async () => {
    const events: Event[] = [];
    Notifications.subscribe("deliver.action_mailer", (event: Event) => events.push(event));
    try {
      await BaseMailer.welcome({ body: "Hello there" }).deliverNow();

      expect(events.length).toBe(1);
      expect(events[0].name).toBe("deliver.action_mailer");
      expect(events[0].payload.messageId).not.toBeNull();
    } finally {
      Notifications.unsubscribe("deliver.action_mailer");
    }
  });
});

describe("PreviewTest", () => {
  class A extends Preview {}

  const B = {
    A: class A extends Preview {},
    C: class C extends Preview {},
  };

  class C extends Preview {}

  const PreviewTestNamespace = {};
  constSet(TopLevel, "PreviewTest", PreviewTestNamespace);
  constSet(PreviewTestNamespace, "A", A);
  constSet(PreviewTestNamespace, "B", B);
  constSet(B, "A", B.A);
  constSet(B, "C", B.C);
  constSet(PreviewTestNamespace, "C", C);

  it("all() returns mailers in alphabetical order", async () => {
    await stub(Preview, "descendants", [C, A, B.C, B.A], [], async () => {
      const mailers = await Preview.all();
      expect(mailers).toEqual([A, B.A, B.C, C]);
    });
  });
});

describe("BasePreviewTest", () => {
  class BaseMailerPreview extends Preview {
    welcome() {
      return BaseMailer.welcome(this.params);
    }
  }

  // BLOCKED: preview-call-awaits-message-delivery-before-interceptors
  it.skip("has access to params", async () => {
    const params = { name: "World" };

    const message = BaseMailerPreview.call("welcome", params) as unknown as MessageDelivery;
    expect(((await message.message()).get("name") as Field).decoded()).toBe("World");
  });
});

class BaseMailerPreview extends Preview {
  welcome() {
    return BaseMailer.welcome();
  }
}

const BasePreviewInterceptorsTest = {
  MyInterceptor: class MyInterceptor {
    static deliveringEmail(_mail: unknown): void {}
    static previewingEmail(_mail: unknown): void {}
  },
  MySecondInterceptor: class MySecondInterceptor {
    static deliveringEmail(_mail: unknown): void {}
    static previewingEmail(_mail: unknown): void {}
  },
};
constSet(TopLevel, "BasePreviewInterceptorsTest", BasePreviewInterceptorsTest);
constSet(BasePreviewInterceptorsTest, "BaseMailerPreview", BaseMailerPreview);
constSet(BasePreviewInterceptorsTest, "MyInterceptor", BasePreviewInterceptorsTest.MyInterceptor);
constSet(
  BasePreviewInterceptorsTest,
  "MySecondInterceptor",
  BasePreviewInterceptorsTest.MySecondInterceptor,
);

describe("BasePreviewInterceptorsTest", () => {
  const { MyInterceptor, MySecondInterceptor } = BasePreviewInterceptorsTest;

  beforeAll(() => {
    Base.previewInterceptors.length = 0;
  });

  afterEach(() => {
    Base.previewInterceptors.length = 0;
  });

  it("you can register and unregister a preview interceptor to the mail object that gets passed the mail object before previewing", async () => {
    Base.registerPreviewInterceptor(MyInterceptor);
    const mail = BaseMailer.welcome();
    await mail.message();
    await stub(BaseMailerPreview.prototype, "welcome", mail, [], async () => {
      await assertCalledWith(MyInterceptor, "previewingEmail", [mail], {}, () => {
        BaseMailerPreview.call("welcome");
      });
    });

    Base.unregisterPreviewInterceptor(MyInterceptor);
    await assertNotCalled(MyInterceptor, "previewingEmail", null, () => {
      BaseMailerPreview.call("welcome");
    });
  });

  it("you can register and unregister a preview interceptor using its stringified name to the mail object that gets passed the mail object before previewing", async () => {
    Base.registerPreviewInterceptor("BasePreviewInterceptorsTest::MyInterceptor");
    const mail = BaseMailer.welcome();
    await mail.message();
    await stub(BaseMailerPreview.prototype, "welcome", mail, [], async () => {
      await assertCalledWith(MyInterceptor, "previewingEmail", [mail], {}, () => {
        BaseMailerPreview.call("welcome");
      });
    });

    Base.unregisterPreviewInterceptor("BasePreviewInterceptorsTest::MyInterceptor");
    await assertNotCalled(MyInterceptor, "previewingEmail", null, () => {
      BaseMailerPreview.call("welcome");
    });
  });

  it("you can register and unregister a preview interceptor using its symbolized underscored name to the mail object that gets passed the mail object before previewing", async () => {
    Base.registerPreviewInterceptor("base_preview_interceptors_test/my_interceptor");
    const mail = BaseMailer.welcome();
    await mail.message();
    await stub(BaseMailerPreview.prototype, "welcome", mail, [], async () => {
      await assertCalledWith(MyInterceptor, "previewingEmail", [mail], {}, () => {
        BaseMailerPreview.call("welcome");
      });
    });

    Base.unregisterPreviewInterceptor("base_preview_interceptors_test/my_interceptor");
    await assertNotCalled(MyInterceptor, "previewingEmail", null, () => {
      BaseMailerPreview.call("welcome");
    });
  });

  it("you can register and unregister multiple preview interceptors to the mail object that both get passed the mail object before previewing", async () => {
    Base.registerPreviewInterceptors(
      "BasePreviewInterceptorsTest::MyInterceptor",
      MySecondInterceptor,
    );
    const mail = BaseMailer.welcome();
    await mail.message();
    await stub(BaseMailerPreview.prototype, "welcome", mail, [], async () => {
      await assertCalledWith(MyInterceptor, "previewingEmail", [mail], {}, async () => {
        await assertCalledWith(MySecondInterceptor, "previewingEmail", [mail], {}, () => {
          BaseMailerPreview.call("welcome");
        });
      });
    });

    Base.unregisterPreviewInterceptors(
      "BasePreviewInterceptorsTest::MyInterceptor",
      MySecondInterceptor,
    );
    await assertNotCalled(MyInterceptor, "previewingEmail", null, () => {
      BaseMailerPreview.call("welcome");
    });
    await assertNotCalled(MySecondInterceptor, "previewingEmail", null, () => {
      BaseMailerPreview.call("welcome");
    });
  });
});
