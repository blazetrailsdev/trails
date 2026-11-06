import { ActionView } from "@blazetrails/actionpack";
import { Base64 } from "@blazetrails/ruby-compat";
import { dasherize } from "@blazetrails/activesupport";
import type { Message } from "@blazetrails/mail";
import { Base } from "../../base.js";
import type { Collector } from "../../collector.js";

type Format = Collector & Record<string, (...args: unknown[]) => unknown>;
type Hash = Record<string, unknown>;

const FIXTURES: Record<string, string> = {
  "base-mailer/attachment-with-content.tse": "Attachment with content",
  "base-mailer/attachment-with-hash.html.tse": "",
  "base-mailer/attachment-with-hash-default-encoding.html.tse": "",
  "base-mailer/inline-attachment.html.tse":
    "<h1>Inline Image</h1>\n\n<%= imageTag(attachments().get('logo.png').url()) %>\n\n<p>This is an image that is inline</p>",
  "base-mailer/inline-attachment.text.tse": "Inline Image\n\nNo image for you\n",
  "base-mailer/inline-and-other-attachments.html.tse":
    "<h1>Inline Image</h1>\n\n<%= imageTag(attachments().get('logo.png').url()) %>\n\n<p>This is an image that is inline</p>",
  "base-mailer/inline-and-other-attachments.text.tse": "Inline Image\n\nNo image for you\n",
  "base-mailer/different-layout.html.tse": "HTML",
  "base-mailer/different-layout.text.tse": "PLAIN",
  "base-mailer/email-with-translations.html.tse": "<%= t('.greet_user', { name: 'lifo' }) %>",
  "base-mailer/explicit-multipart-templates.html.tse": "HTML Explicit Multipart Templates",
  "base-mailer/explicit-multipart-templates.text.tse": "TEXT Explicit Multipart Templates",
  "base-mailer/explicit-multipart-with-one-template.tse": "<%= '[' + formats.join(', ') + ']' %>",
  "base-mailer/html-only.html.tse": "<h1>Testing</h1>",
  "base-mailer/implicit-multipart-formats.html.tse":
    "Implicit Multipart <%= '[' + formats.join(', ') + ']' %>",
  "base-mailer/implicit-multipart-formats.text.tse":
    "Implicit Multipart <%= '[' + formats.join(', ') + ']' %>",
  "base-mailer/implicit-multipart.html.tse": "HTML Implicit Multipart",
  "base-mailer/implicit-multipart.text.tse": "TEXT Implicit Multipart",
  "base-mailer/implicit-with-locale.de-AT.text.tse": "Implicit with locale DE-AT TEXT",
  "base-mailer/implicit-with-locale.de.html.tse": "Implicit with locale DE HTML",
  "base-mailer/implicit-with-locale.en.html.tse": "Implicit with locale EN HTML",
  "base-mailer/implicit-with-locale.html.tse": "Implicit with locale HTML",
  "base-mailer/implicit-with-locale.pl.text.tse": "Implicit with locale PL TEXT",
  "base-mailer/implicit-with-locale.text.tse": "Implicit with locale TEXT",
  "base-mailer/plain-text-only.text.tse": "Testing",
  "base-mailer/welcome.tse": "Welcome",
  "base-mailer/welcome-with-headers.html.tse": "",
  "base-mailer/without-mail-call.tse":
    "<% throw new Error('the template should not be rendered') %>",
  "layouts/different-layout.html.tse": "HTML -- <%= yield %>",
  "layouts/different-layout.text.tse": "PLAIN -- <%= yield %>",
};

export const ANOTHER_PATH_FIXTURES: Record<string, string> = {
  "base-mailer/welcome.tse": "Welcome from another path",
};

export const ANOTHER_PATH_RESOLVER = new ActionView.FixtureResolver(ANOTHER_PATH_FIXTURES);

export const UNKNOWN_RESOLVER = new ActionView.FixtureResolver({});

export class BaseMailer extends Base {
  static {
    this.setMailerName("base_mailer");

    this.default({
      to: "system@test.lindsaar.net",
      from: "jose@test.plataformatec.com",
      replyTo: this.emailAddressWithName("mikel@test.lindsaar.net", "Mikel"),
    });

    this.prependViewPath(new ActionView.FixtureResolver(FIXTURES));
    this.appendViewPath(
      new ActionView.FixtureResolver({
        "another.path/base-mailer/welcome.tse": "Welcome from another path",
      }),
    );
  }

  welcome(hash: Hash = {}) {
    (this.headers() as Message).set("X-SPAM", "Not SPAM");
    return this.mail(Object.assign({ subject: "The first email on new API!" }, hash));
  }

  welcomeFromAnotherPath(path: string | string[]) {
    return this.mail({ templateName: "welcome", templatePath: path });
  }

  welcomeWithHeaders(hash: Hash = {}) {
    this.headers(hash);
    return this.mail();
  }

  withName() {
    const to = this.emailAddressWithName("sunny@example.com", "Sunny");
    return this.mail({ templateName: "welcome", to: to });
  }

  withBlankName() {
    const to = this.emailAddressWithName("sunny@example.com", "");
    return this.mail({ templateName: "welcome", to: to });
  }

  htmlOnly(hash: Hash = {}) {
    return this.mail(hash);
  }

  plainTextOnly(hash: Hash = {}) {
    return this.mail(hash);
  }

  async inlineAttachment() {
    await this.attachments()
      .inline()
      .set("logo.png", new Uint8Array([0xca, 0x8b, 0xac, 0x9a]));
    return this.mail();
  }

  async inlineAndOtherAttachments() {
    await this.attachments()
      .inline()
      .set("logo.png", new Uint8Array([0xca, 0x8b, 0xac, 0x9a]));
    await this.attachments().set("certificate.pdf", "This is test File content");
    return this.mail();
  }

  async attachmentWithContent(hash: Hash = {}) {
    await this.attachments().set("invoice.pdf", "This is test File content");
    return this.mail(hash);
  }

  async attachmentWithHash() {
    await this.attachments().set("invoice.jpg", {
      data: Base64.encode64(new Uint8Array([0xca, 0x8b, 0xac, 0x9a, 0x29, 0x62])),
      mimeType: "image/x-jpg",
      transferEncoding: "base64",
    });
    return this.mail();
  }

  async attachmentWithHashDefaultEncoding() {
    await this.attachments().set("invoice.jpg", {
      data: new Uint8Array([0xca, 0x8b, 0xac, 0x9a, 0x29, 0x62]),
      mimeType: "image/x-jpg",
    });
    return this.mail();
  }

  async implicitMultipart(hash: Hash = {}) {
    if (hash.attachments != null && delete hash.attachments) {
      await this.attachments().set("invoice.pdf", "This is test File content");
    }
    return this.mail(hash);
  }

  implicitMultipartFormats(hash: Hash = {}) {
    return this.mail(hash);
  }

  implicitWithLocale(hash: Hash = {}) {
    return this.mail(hash);
  }

  async explicitMultipart(hash: Hash = {}) {
    if (hash.attachments != null && delete hash.attachments) {
      await this.attachments().set("invoice.pdf", "This is test File content");
    }
    return this.mail(hash, async (format) => {
      const f = format as Format;
      await f.text(() => this.render({ plain: "TEXT Explicit Multipart" }));
      await f.html(() => this.render({ plain: "HTML Explicit Multipart" }));
    });
  }

  explicitMultipartTemplates(hash: Hash = {}) {
    return this.mail(hash, async (format) => {
      const f = format as Format;
      await f.html();
      await f.text();
    });
  }

  explicitMultipartWithAny(hash: Hash = {}) {
    return this.mail(hash, async (format) => {
      await format.any("text", "html", () => this.render({ plain: "Format with any!" }));
    });
  }

  explicitWithoutSpecifyingFormatWithAny(hash: Hash = {}) {
    return this.mail(hash, async (format) => {
      await format.any();
    });
  }

  explicitMultipartWithOptions(includeHtml = false) {
    return this.mail({}, async (format) => {
      const f = format as Format;
      await f.text({ contentTransferEncoding: "base64" }, () => this.render("welcome"));
      if (includeHtml) await f.html(() => this.render("welcome"));
    });
  }

  explicitMultipartWithOneTemplate(hash: Hash = {}) {
    return this.mail(hash, async (format) => {
      const f = format as Format;
      await f.html();
      await f.text();
    });
  }

  implicitDifferentTemplate(templateName = "") {
    return this.mail({ templateName: templateName });
  }

  implicitDifferentTemplateWithBlock(templateName = "") {
    return this.mail({ templateName: templateName }, async (format) => {
      const f = format as Format;
      await f.text();
      await f.html();
    });
  }

  explicitDifferentTemplate(templateName = "") {
    return this.mail({}, async (format) => {
      const f = format as Format;
      await f.text(() =>
        this.render({ template: `${dasherize(this.mailerName())}/${templateName}` }),
      );
      await f.html(() =>
        this.render({ template: `${dasherize(this.mailerName())}/${templateName}` }),
      );
    });
  }

  differentLayout(layoutName = "") {
    return this.mail({}, async (format) => {
      const f = format as Format;
      await f.text(() => this.render({ layout: layoutName }));
      await f.html(() => this.render({ layout: layoutName }));
    });
  }

  async emailWithTranslations() {
    return this.mail({
      body: await this.render("email-with-translations", { formats: [":html"] }),
    });
  }

  withoutMailCall() {}

  async withNilAsReturnValue() {
    await this.mail({ templateName: "welcome" });
    return null;
  }

  withSubjectInterpolations() {
    return this.mail({
      subject: this.defaultI18nSubject({ rapperOrImpersonator: "Slim Shady" }),
      body: "",
    });
  }
}
