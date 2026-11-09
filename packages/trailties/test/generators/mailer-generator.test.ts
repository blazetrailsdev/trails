import { File, Dir, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { capture } from "@blazetrails/activesupport";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import "../../lib/test-unit/trailtie.js";
import { TestCase } from "../../lib/generators/test-case.js";
import { assertInstanceMethod } from "../../lib/generators/testing/assertions.js";

class MailerGeneratorApp extends Application {}
class MailerGeneratorTest extends TestCase {}
MailerGeneratorTest.destination(Dir.mktmpdir());
MailerGeneratorTest.arguments(["notifier", "foo", "bar"]);
registerSpecType(/^MailerGeneratorTest$/, MailerGeneratorTest);
let t: TestCase;

beforeAll(async () => {
  await MailerGeneratorApp.instance().loadGenerators();
  const { MailerGenerator } =
    await import("../../lib/generators/trails/mailer/mailer-generator.js");
  MailerGeneratorTest.tests(MailerGenerator);
});

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  Trails.application = MailerGeneratorApp.instance();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
});

afterEach(() => {
  Trails.application = null;
});

describe("MailerGeneratorTest", () => {
  it("mailer skeleton is created", async () => {
    await t.runGenerator();
    await t.assertFile("app/mailers/notifier-mailer.ts", (mailer) => {
      expect(mailer).toMatch(/class NotifierMailer extends ApplicationMailer/);
      expect(mailer).not.toMatch(/default\(\{ from: "from@example\.com" \}\)/);
      expect(mailer).not.toMatch(/layout\("mailer_notifier"\)/);
    });

    await t.assertFile("app/mailers/application-mailer.ts", (mailer) => {
      expect(mailer).toMatch(/class ApplicationMailer extends ActionMailer\.Base/);
      expect(mailer).toMatch(/default\(\{ from: "from@example\.com" \}\)/);
      expect(mailer).toMatch(/layout\("mailer"\)/);
    });
  });

  it("mailer with i18n helper", async () => {
    await t.runGenerator();
    await t.assertFile("app/mailers/notifier-mailer.ts", (mailer) => {
      expect(mailer).toMatch(/en\.notifier_mailer\.foo\.subject/);
      expect(mailer).toMatch(/en\.notifier_mailer\.bar\.subject/);
    });
  });

  it("check class collision", async () => {
    constSet(TopLevel, "NotifierMailer", class {});
    try {
      const content = await capture("stderr", () => t.runGenerator());
      expect(content).toMatch(
        /The name 'NotifierMailer' is either already used in your application or reserved/,
      );
    } finally {
      delete (TopLevel as Record<string, unknown>)["NotifierMailer"];
    }
  });

  it("invokes default test framework", async () => {
    await t.runGenerator();
    await t.assertFile("test/mailers/notifier-mailer.test.ts", (test) => {
      expect(test).toMatch(/class NotifierMailerTest extends ActionMailer\.TestCase/);
      expect(test).toMatch(/test\("foo"/);
      expect(test).toMatch(/test\("bar"/);
    });
    await t.assertFile("test/mailers/previews/notifier-mailer-preview.ts", async (preview) => {
      expect(preview).toMatch(
        /\/\/ Preview all emails at http:\/\/localhost:3000\/trails\/mailers\/notifier_mailer/,
      );
      expect(preview).toMatch(/class NotifierMailerPreview extends ActionMailer\.Preview/);
      expect(preview).toMatch(
        /\/\/ Preview this email at http:\/\/localhost:3000\/trails\/mailers\/notifier_mailer\/foo/,
      );
      await assertInstanceMethod("foo", preview, (foo) => {
        expect(foo).toMatch(/NotifierMailer\b.*\.foo\(\)/);
      });
      expect(preview).toMatch(
        /\/\/ Preview this email at http:\/\/localhost:3000\/trails\/mailers\/notifier_mailer\/bar/,
      );
      await assertInstanceMethod("bar", preview, (bar) => {
        expect(bar).toMatch(/NotifierMailer\b.*\.bar\(\)/);
      });
    });
  });

  it("check test class collision", async () => {
    constSet(TopLevel, "NotifierMailerTest", class {});
    try {
      const content = await capture("stderr", () => t.runGenerator());
      expect(content).toMatch(
        /The name 'NotifierMailerTest' is either already used in your application or reserved/,
      );
    } finally {
      delete (TopLevel as Record<string, unknown>)["NotifierMailerTest"];
    }
  });

  it("check preview class collision", async () => {
    constSet(TopLevel, "NotifierMailerPreview", class {});
    try {
      const content = await capture("stderr", () => t.runGenerator());
      expect(content).toMatch(
        /The name 'NotifierMailerPreview' is either already used in your application or reserved/,
      );
    } finally {
      delete (TopLevel as Record<string, unknown>)["NotifierMailerPreview"];
    }
  });

  it("invokes default text template engine", async () => {
    await t.runGenerator();
    await t.assertFile("app/views/notifier-mailer/foo.text.tse", (view) => {
      expect(view).toMatch(/\sapp\/views\/notifier-mailer\/foo\.text\.tse/);
      expect(view).toMatch(/<%= this\.greeting %>/);
    });

    await t.assertFile("app/views/notifier-mailer/bar.text.tse", (view) => {
      expect(view).toMatch(/\sapp\/views\/notifier-mailer\/bar\.text\.tse/);
      expect(view).toMatch(/<%= this\.greeting %>/);
    });

    await t.assertFile("app/views/layouts/mailer.text.tse", (view) => {
      expect(view).toMatch(/<%= yield %>/);
    });
  });

  it("invokes default html template engine", async () => {
    await t.runGenerator();
    await t.assertFile("app/views/notifier-mailer/foo.html.tse", (view) => {
      expect(view).toMatch(/\sapp\/views\/notifier-mailer\/foo\.html\.tse/);
      expect(view).toMatch(/<%= this\.greeting %>/);
    });

    await t.assertFile("app/views/notifier-mailer/bar.html.tse", (view) => {
      expect(view).toMatch(/\sapp\/views\/notifier-mailer\/bar\.html\.tse/);
      expect(view).toMatch(/<%= this\.greeting %>/);
    });

    await t.assertFile("app/views/layouts/mailer.html.tse", (view) => {
      expect(view).toMatch(/<body>\n {4}<%= yield %>\n {2}<\/body>/);
    });
  });

  it("invokes default template engine even with no action", async () => {
    await t.runGenerator(["notifier"]);
    await t.assertFile("app/views/notifier-mailer");
  });

  it("logs if the template engine cannot be found", async () => {
    const content = await t.runGenerator(["notifier", "foo", "bar", "--template-engine=haml"]);
    expect(content).toMatch(/haml \[not found\]/);
  });

  it("mailer with namespaced mailer", async () => {
    await t.runGenerator(["Farm::Animal", "moos"]);
    await t.assertFile("app/mailers/farm/animal-mailer.ts", (mailer) => {
      expect(mailer).toMatch(/class AnimalMailer extends ApplicationMailer/);
      expect(mailer).toMatch(/en\.farm\.animal_mailer\.moos\.subject/);
    });
    await t.assertFile("test/mailers/previews/farm/animal-mailer-preview.ts", (preview) => {
      expect(preview).toMatch(
        /\/\/ Preview all emails at http:\/\/localhost:3000\/trails\/mailers\/farm\/animal_mailer/,
      );
      expect(preview).toMatch(/class AnimalMailerPreview extends ActionMailer\.Preview/);
      expect(preview).toMatch(
        /\/\/ Preview this email at http:\/\/localhost:3000\/trails\/mailers\/farm\/animal_mailer\/moos/,
      );
    });
    await t.assertFile("app/views/farm/animal-mailer/moos.text.tse");
    await t.assertFile("app/views/farm/animal-mailer/moos.html.tse");
  });

  it("actions are turned into methods", async () => {
    await t.runGenerator();

    await t.assertFile("app/mailers/notifier-mailer.ts", async (mailer) => {
      await assertInstanceMethod("foo", mailer, (foo) => {
        expect(foo).toMatch(/this\.mail\(\{ to: "to@example\.org" \}\)/);
        expect(foo).toMatch(/this\.greeting = "Hi"/);
      });

      await assertInstanceMethod("bar", mailer, (bar) => {
        expect(bar).toMatch(/this\.mail\(\{ to: "to@example\.org" \}\)/);
        expect(bar).toMatch(/this\.greeting = "Hi"/);
      });
    });
  });

  it("mailer on revoke", async () => {
    await t.runGenerator();
    await t.runGenerator(["notifier"], { behavior: "revoke" });

    t.assertNoFile("app/mailers/notifier.ts");
    t.assertNoFile("app/views/notifier/foo.text.tse");
    t.assertNoFile("app/views/notifier/bar.text.tse");
    t.assertNoFile("app/views/notifier/foo.html.tse");
    t.assertNoFile("app/views/notifier/bar.html.tse");
  });

  it("mailer suffix is not duplicated", async () => {
    await t.runGenerator(["notifier_mailer"]);

    t.assertNoFile("app/mailers/notifier-mailer-mailer.ts");
    await t.assertFile("app/mailers/notifier-mailer.ts");

    t.assertNoFile("app/views/notifier-mailer-mailer/");
    await t.assertFile("app/views/notifier-mailer/");

    t.assertNoFile("test/mailers/notifier-mailer-mailer.test.ts");
    await t.assertFile("test/mailers/notifier-mailer.test.ts");

    t.assertNoFile("test/mailers/previews/notifier-mailer-mailer-preview.ts");
    await t.assertFile("test/mailers/previews/notifier-mailer-preview.ts");
  });
});
