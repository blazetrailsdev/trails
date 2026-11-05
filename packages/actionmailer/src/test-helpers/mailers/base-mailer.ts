import { ActionView } from "@blazetrails/actionpack";
import { dasherize } from "@blazetrails/activesupport";
import type { Message } from "@blazetrails/mail";
import { Base } from "../../base.js";
import type { Collector } from "../../collector.js";

type Format = Collector & Record<string, (...args: unknown[]) => unknown>;
type Hash = Record<string, unknown>;

export const FIXTURES: Record<string, string> = {
  "base-mailer/attachment-with-content.tse": "Attachment with content",
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

export class BaseMailer extends Base {
  static {
    this.setMailerName("base_mailer");

    this.default({
      to: "system@test.lindsaar.net",
      from: "jose@test.plataformatec.com",
      replyTo: this.emailAddressWithName("mikel@test.lindsaar.net", "Mikel"),
    });

    this.prependViewPath(new ActionView.FixtureResolver(FIXTURES));
  }

  welcome(hash: Hash = {}) {
    (this.headers() as Message).set("X-SPAM", "Not SPAM");
    return this.mail(Object.assign({ subject: "The first email on new API!" }, hash));
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

  async attachmentWithContent(hash: Hash = {}) {
    await this.attachments().set("invoice.pdf", "This is test File content");
    return this.mail(hash);
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
    return this.mail(hash, (format) => {
      const f = format as Format;
      f.text(() => this.render({ plain: "TEXT Explicit Multipart" }));
      f.html(() => this.render({ plain: "HTML Explicit Multipart" }));
    });
  }

  explicitMultipartTemplates(hash: Hash = {}) {
    return this.mail(hash, (format) => {
      const f = format as Format;
      f.html();
      f.text();
    });
  }

  explicitMultipartWithAny(hash: Hash = {}) {
    return this.mail(hash, (format) => {
      format.any("text", "html", () => this.render({ plain: "Format with any!" }));
    });
  }

  explicitWithoutSpecifyingFormatWithAny(hash: Hash = {}) {
    return this.mail(hash, (format) => {
      format.any();
    });
  }

  explicitMultipartWithOneTemplate(hash: Hash = {}) {
    return this.mail(hash, (format) => {
      const f = format as Format;
      f.html();
      f.text();
    });
  }

  implicitDifferentTemplate(templateName = "") {
    return this.mail({ templateName: templateName });
  }

  implicitDifferentTemplateWithBlock(templateName = "") {
    return this.mail({ templateName: templateName }, (format) => {
      const f = format as Format;
      f.text();
      f.html();
    });
  }

  explicitDifferentTemplate(templateName = "") {
    return this.mail({}, (format) => {
      const f = format as Format;
      f.text(() => this.render({ template: `${dasherize(this.mailerName())}/${templateName}` }));
      f.html(() => this.render({ template: `${dasherize(this.mailerName())}/${templateName}` }));
    });
  }

  differentLayout(layoutName = "") {
    return this.mail({}, (format) => {
      const f = format as Format;
      f.text(() => this.render({ layout: layoutName }));
      f.html(() => this.render({ layout: layoutName }));
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
