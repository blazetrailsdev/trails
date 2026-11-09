import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Assertions } from "@blazetrails/actionview/rails-dom-testing/assertions";
import { Methods } from "@blazetrails/rack-test";
import { HTML5 } from "@blazetrails/nokogiri";
import { h } from "@blazetrails/activesupport";
import { travelTo } from "@blazetrails/activesupport/testing/time-helpers";
import { Mail } from "@blazetrails/mail";
import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { Base64, File, getFs, include } from "@blazetrails/ruby-compat";
import { Generation } from "../support/isolation/abstract-unit.js";
import type { Rack } from "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class MailerPreviewsTest extends TestCase {
  async buildApp(options: Parameters<Generation["buildApp"]>[0] = {}): Promise<void> {
    await Generation.prototype.buildApp.call(this, options);
    await this.appFile(
      "config/routes.ts",
      'import { Trails } from "@blazetrails/trailties"; Trails.application!.routes().draw(function () {});',
    );
    await this.appDir("test/mailers/previews");
    const application = File.join(await this.appPath(), "config/application.ts");
    const source = await getFs().readFile(application, "utf-8");
    await getFs().writeFile!(
      application,
      source.replace(
        '// import "@blazetrails/trailties/trailties/action-mailer";',
        'import "@blazetrails/trailties/trailties/action-mailer";',
      ),
    );
  }

  documentRootElement() {
    return HTML5.Document.parse(this.lastResponse().body);
  }

  mailer(name: string, contents: string): Promise<string> {
    return this.appFile(`app/mailers/${name}.ts`, contents);
  }

  mailerPreview(name: string, contents: string): Promise<string> {
    return this.appFile(`test/mailers/previews/${name}-preview.ts`, contents);
  }

  htmlTemplate(name: string, contents: string): Promise<string> {
    return this.appFile(`app/views/${name}.html.tse`, contents);
  }

  textTemplate(name: string, contents: string): Promise<string> {
    return this.appFile(`app/views/${name}.text.tse`, contents);
  }

  async imageFile(name: string, contents: string): Promise<void> {
    const fileName = `${await this.appPath()}/public/images/${name}`;
    await this.appDir("public/images");
    await getFs().writeFile!(fileName, Base64.strictDecode64(contents));
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface MailerPreviewsTest
  extends
    Omit<Generation, "buildApp">,
    Omit<Rack, "get" | "assert" | "assertEqual" | "assertMatch"> {
  get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
  lastResponse(): {
    status: number;
    body: string;
    headers: Record<string, string>;
    isOk: boolean;
    isNotFound: boolean;
  };
  assertSelect(...args: unknown[]): void;
}
include(MailerPreviewsTest, Isolation);
include(MailerPreviewsTest, Methods);
include(MailerPreviewsTest, Assertions);
registerSpecType(/^MailerPreviewsTest$/, MailerPreviewsTest);

const mailerSource = (name: string, body: string): string => `
  import { ActionMailer } from "@blazetrails/actionmailer";
  export class ${name} extends ActionMailer.Base {
    ${body}
  }
`;

const previewSource = (name: string, body: string): string => `
  import { ActionMailer } from "@blazetrails/actionmailer";
  import { TopLevel } from "@blazetrails/ruby-compat";
  export class ${name} extends ActionMailer.Preview {
    ${body}
  }
`;

const FROM = 'static { this.default({ from: "from@example.com" }); }';
const FOO = 'foo() { return this.mail({ to: "to@example.org" }); }';

describe("MailerPreviewsTest", { timeout: 120_000 }, () => {
  let t: MailerPreviewsTest;

  beforeEach(async () => {
    t = new MailerPreviewsTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("/trails/mailers is accessible in development", async () => {
    await t.app("development");
    await t.get("/trails/mailers");
    expect(t.lastResponse().status).toBe(200);
  });

  it("/trails/mailers is not accessible with show_previews = false", async () => {
    await t.addToConfig("this.config.actionMailer.showPreviews = false;");
    await t.app("development");
    await t.get("/trails/mailers");
    expect(t.lastResponse().status).toBe(404);
  });

  it("/trails/mailers is accessible with globbing route present", async () => {
    await t.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application!.routes().draw(function () {
          this.get("*foo", { to: "foo#index" });
        });
      `,
    );
    await t.app("development");
    await t.get("/trails/mailers");
    expect(t.lastResponse().status).toBe(200);
  });

  it("request without mailer previews links to documentation", async () => {
    await t.app("development");

    await t.get("/trails/mailers");
    t.assertSelect("title", { text: "Action Mailer Previews" });
    t.assertSelect("h1", { text: "Action Mailer Previews" });
    t.assertSelect("p", { text: "You have not defined any Action Mailer Previews." });
    t.assertSelect(
      "p",
      { text: "Read Action Mailer Basics to learn how to define your first." },
      () => {
        t.assertSelect(
          "a[href=?]",
          "https://guides.rubyonrails.org/action_mailer_basics.html#previewing-emails",
          { text: "Action Mailer Basics" },
        );
      },
    );
  });

  it("mailer previews are loaded from the default preview_paths", async () => {
    await t.mailer("notifier", mailerSource("Notifier", `${FROM} ${FOO}`));
    await t.textTemplate("notifier/foo", "Hello, World!");
    await t.mailerPreview(
      "notifier",
      previewSource("NotifierPreview", "foo() { return TopLevel.Notifier.foo(); }"),
    );

    await t.app("development");

    await t.get("/trails/mailers");
    t.assertSelect("title", { text: "Action Mailer Previews" });
    t.assertSelect("h1", { text: "Action Mailer Previews" });
    expect(t.lastResponse().body).toMatch(
      '<h3><a href="/trails/mailers/notifier">Notifier</a></h3>',
    );
    expect(t.lastResponse().body).toMatch(
      '<li><a href="/trails/mailers/notifier/foo">foo</a></li>',
    );
  });

  it("mailer without previews", async () => {
    await t.mailer("notifier", mailerSource("Notifier", ""));

    await t.mailerPreview("notifier", previewSource("NotifierPreview", ""));

    await t.app("development");
    await t.get("/trails/mailers/notifier");

    expect(t.lastResponse().isOk).toBeTruthy();
    t.assertSelect("title", { text: "Action Mailer Previews for notifier" });
    t.assertSelect("h1", { text: "Action Mailer Previews for notifier" });
    t.assertSelect("p", { text: "You have not defined any actions for NotifierPreview." });
    t.assertSelect(
      "p",
      { text: "Read Action Mailer Basics to learn how to define your first." },
      () => {
        t.assertSelect(
          "a[href=?]",
          "https://guides.rubyonrails.org/action_mailer_basics.html#previewing-emails",
          { text: "Action Mailer Basics" },
        );
      },
    );
  });

  it("mailer with previews", async () => {
    await t.mailer("notifier", mailerSource("Notifier", "foo() {}"));

    await t.mailerPreview(
      "notifier",
      previewSource("NotifierPreview", "foo() { return TopLevel.Notifier.foo(); }"),
    );

    await t.app("development");
    await t.get("/trails/mailers/notifier");

    expect(t.lastResponse().isOk).toBeTruthy();
    t.assertSelect("title", { text: "Action Mailer Previews for notifier" });
    t.assertSelect("h1", { text: "Action Mailer Previews for notifier" });
    t.assertSelect("ul li a[href=?]", "/trails/mailers/notifier/foo");
  });

  it("mailer preview not found", async () => {
    await t.app("development");
    await t.get("/trails/mailers/notifier");
    expect(t.lastResponse().isNotFound).toBeTruthy();
    expect(String(h(t.lastResponse().body))).toMatch("Mailer preview &#39;notifier&#39; not found");
  });

  it("mailer preview email not found", async () => {
    await t.mailer("notifier", mailerSource("Notifier", `${FROM} ${FOO}`));

    await t.textTemplate("notifier/foo", "Hello, World!");

    await t.mailerPreview(
      "notifier",
      previewSource("NotifierPreview", "foo() { return TopLevel.Notifier.foo(); }"),
    );

    await t.app("development");

    await t.get("/trails/mailers/notifier/bar");
    expect(t.lastResponse().isNotFound).toBeTruthy();
    expect(String(h(t.lastResponse().body))).toMatch(
      "Email &#39;bar&#39; not found in NotifierPreview",
    );

    await t.get("/trails/mailers/download/notifier/bar");
    expect(t.lastResponse().isNotFound).toBeTruthy();
    expect(String(h(t.lastResponse().body))).toMatch(
      "Email &#39;bar&#39; not found in NotifierPreview",
    );
  });

  it("mailer preview NullMail", async () => {
    await t.mailer("notifier", mailerSource("Notifier", `${FROM} foo() {}`));

    await t.mailerPreview(
      "notifier",
      previewSource("NotifierPreview", "foo() { return TopLevel.Notifier.foo(); }"),
    );

    await t.app("development");

    await t.get("/trails/mailers/notifier/foo");
    expect(t.lastResponse().body).toMatch(
      "You are trying to preview an email that does not have any content.",
    );
    expect(t.lastResponse().body).toMatch("notifier#foo");
  });

  it("mailer preview email part not found", async () => {
    await t.mailer("notifier", mailerSource("Notifier", `${FROM} ${FOO}`));

    await t.textTemplate("notifier/foo", "Hello, World!");

    await t.mailerPreview(
      "notifier",
      previewSource("NotifierPreview", "foo() { return TopLevel.Notifier.foo(); }"),
    );

    await t.app("development");

    await t.get("/trails/mailers/notifier/foo?part=text%2Fhtml");
    expect(t.lastResponse().isNotFound).toBeTruthy();
    expect(String(h(t.lastResponse().body))).toMatch(
      "Email part &#39;text/html&#39; not found in NotifierPreview#foo",
    );
  });

  it("message header uses full display names", async () => {
    await t.mailer(
      "notifier",
      mailerSource(
        "Notifier",
        `static { this.default({ from: "Ruby on Rails <core@rubyonrails.org>" }); }

        foo() {
          return this.mail({
            to: "Andrew White <andyw@pixeltrix.co.uk>",
            cc: "David Heinemeier Hansson <david@heinemeierhansson.com>",
          });
        }`,
      ),
    );

    await t.textTemplate("notifier/foo", "Hello, World!");

    await t.mailerPreview(
      "notifier",
      previewSource("NotifierPreview", "foo() { return TopLevel.Notifier.foo(); }"),
    );

    await t.app("development");

    await t.get("/trails/mailers/notifier/foo");
    expect(t.lastResponse().status).toBe(200);
    expect(t.lastResponse().body).toMatch(
      '<dd id="from">Ruby on Rails &lt;core@rubyonrails.org&gt;</dd>',
    );
    expect(t.lastResponse().body).toMatch(
      '<dd id="to">Andrew White &lt;andyw@pixeltrix.co.uk&gt;</dd>',
    );
    expect(t.lastResponse().body).toMatch(
      '<dd id="cc">David Heinemeier Hansson &lt;david@heinemeierhansson.com&gt;</dd>',
    );
    expect(t.lastResponse().body).not.toMatch('<dd id="smtp_from">');
    expect(t.lastResponse().body).not.toMatch('<dd id="smtp_to">');

    await t.get("/trails/mailers/download/notifier/foo");
    const email = Mail.readFromString(t.lastResponse().body);
    expect(t.lastResponse().headers["content-disposition"]).toBe(
      "attachment; filename=\"foo.eml\"; filename*=UTF-8''foo.eml",
    );
    expect(t.lastResponse().status).toBe(200);
    expect(email.to()).toEqualRuby(["andyw@pixeltrix.co.uk"]);
    expect(email.cc()).toEqualRuby(["david@heinemeierhansson.com"]);
  });

  it("message header shows SMTP envelope To and From when different than message headers", async () => {
    await t.mailer(
      "notifier",
      mailerSource(
        "Notifier",
        `${FROM}

        foo() {
          this.message.smtpEnvelopeFrom("smtp-from@example.com");
          this.message.smtpEnvelopeTo(["to@example.com", "bcc@example.com"]);

          return this.mail({ to: "to@example.com" });
        }`,
      ),
    );

    await t.mailerPreview(
      "notifier",
      previewSource("NotifierPreview", "foo() { return TopLevel.Notifier.foo(); }"),
    );

    await t.textTemplate("notifier/foo", "Hello, World!");

    await t.app("development");

    await t.get("/trails/mailers/notifier/foo");
    expect(t.lastResponse().status).toBe(200);
    expect(t.lastResponse().body).toMatch('<dd id="from">from@example.com</dd>');
    expect(t.lastResponse().body).toMatch('<dd id="smtp_from">smtp-from@example.com</dd>');
    expect(t.lastResponse().body).toMatch('<dd id="to">to@example.com</dd>');
    expect(t.lastResponse().body).toMatch('<dd id="smtp_to">to@example.com, bcc@example.com</dd>');
  });

  it("part menu selects correct option", async () => {
    await t.mailer("notifier", mailerSource("Notifier", `${FROM} ${FOO}`));

    await t.htmlTemplate("notifier/foo", "<p>Hello, World!</p>");

    await t.textTemplate("notifier/foo", "Hello, World!");

    await t.mailerPreview(
      "notifier",
      previewSource("NotifierPreview", "foo() { return TopLevel.Notifier.foo(); }"),
    );

    await t.app("development");

    await t.get("/trails/mailers/notifier/foo.html");
    expect(t.lastResponse().status).toBe(200);
    expect(t.lastResponse().body).toMatch(
      '<option selected value="part=text%2Fhtml">View as HTML email</option>',
    );

    await t.get("/trails/mailers/notifier/foo.txt");
    expect(t.lastResponse().status).toBe(200);
    expect(t.lastResponse().body).toMatch(
      '<option selected value="part=text%2Fplain">View as plain-text email</option>',
    );
  });

  it("mailer previews create correct links when loaded on a subdirectory", async () => {
    await t.mailer("notifier", mailerSource("Notifier", `${FROM} ${FOO}`));

    await t.textTemplate("notifier/foo", "Hello, World!");

    await t.mailerPreview(
      "notifier",
      previewSource("NotifierPreview", "foo() { return TopLevel.Notifier.foo(); }"),
    );

    await t.app("development");

    await t.get("/trails/mailers", {}, { SCRIPT_NAME: "/my_app" });
    expect(t.lastResponse().body).toMatch(
      '<h3><a href="/my_app/trails/mailers/notifier">Notifier</a></h3>',
    );
    expect(t.lastResponse().body).toMatch(
      '<li><a href="/my_app/trails/mailers/notifier/foo">foo</a></li>',
    );
  });

  it("multipart mailer preview with empty parts", async () => {
    await t.mailer("notifier", mailerSource("Notifier", `${FROM} ${FOO}`));

    await t.textTemplate("notifier/foo", "");

    await t.htmlTemplate("notifier/foo", "");

    await t.mailerPreview(
      "notifier",
      previewSource("NotifierPreview", "foo() { return TopLevel.Notifier.foo(); }"),
    );

    await t.app("development");

    await t.get("/trails/mailers/notifier/foo?part=text/plain");
    expect(t.lastResponse().status).toBe(200);

    await t.get("/trails/mailers/notifier/foo?part=text/html");
    expect(t.lastResponse().status).toBe(200);
  });

  it("mailer preview title tag", async () => {
    await t.mailer("notifier", mailerSource("Notifier", `${FROM} ${FOO}`));

    await t.textTemplate("notifier/foo", "Hello, World!");

    await t.mailerPreview(
      "notifier",
      previewSource("NotifierPreview", "foo() { return TopLevel.Notifier.foo(); }"),
    );

    await t.app("development");

    await t.get("/trails/mailers/notifier/foo");
    expect(t.lastResponse().body).toMatch("<title>Mailer Preview for notifier#foo</title>");
  });

  it("mailer preview sender tags", async () => {
    await t.mailer(
      "notifier",
      mailerSource(
        "Notifier",
        `${FROM}
        foo() {
          return this.mail({ to: "to@example.org", cc: "cc@example.com", bcc: "bcc@example.com" });
        }`,
      ),
    );

    await t.textTemplate("notifier/foo", "Hello, World!");

    await t.mailerPreview(
      "notifier",
      previewSource("NotifierPreview", "foo() { return TopLevel.Notifier.foo(); }"),
    );

    await t.app("development");

    await t.get("/trails/mailers/notifier/foo");
    expect(t.lastResponse().body).toMatch('<dd id="to">to@example.org</dd>');
    expect(t.lastResponse().body).toMatch('<dd id="cc">cc@example.com</dd>');
    expect(t.lastResponse().body).toMatch('<dd id="bcc">bcc@example.com</dd>');
  });

  it("mailer preview date tag renders date from message header", async () => {
    await t.mailer(
      "notifier",
      mailerSource(
        "Notifier",
        `${FROM}

        foo() {
          return this.mail({ to: "to@example.org", date: Time.utc(2023, 10, 20, 10, 20, 30) });
        }`,
      ).replace(
        'import { ActionMailer } from "@blazetrails/actionmailer";',
        'import { ActionMailer } from "@blazetrails/actionmailer";\n  import { Time } from "@blazetrails/date";',
      ),
    );

    await t.textTemplate("notifier/foo", "Hello, World!");

    await t.mailerPreview(
      "notifier",
      previewSource("NotifierPreview", "foo() { return TopLevel.Notifier.foo(); }"),
    );

    await t.app("development");

    await t.get("/trails/mailers/notifier/foo");
    expect(t.lastResponse().body).toMatch('<dd id="date">Fri, 20 Oct 2023 10:20:30 +0000</dd>');
  });

  it("mailer preview date tag falls back to current time when date header is not present", async () => {
    await t.mailer("notifier", mailerSource("Notifier", `${FROM} ${FOO}`));

    await t.textTemplate("notifier/foo", "Hello, World!");

    await t.mailerPreview(
      "notifier",
      previewSource("NotifierPreview", "foo() { return TopLevel.Notifier.foo(); }"),
    );

    await t.app("development");

    await travelTo(Time.utc(2023, 10, 20, 10, 20, 30), {}, async () => {
      await t.get("/trails/mailers/notifier/foo");
    });
    expect(t.lastResponse().body).toMatch('<dd id="date">Fri, 20 Oct 2023 10:20:30 +0000</dd>');
  });
});
