import { afterEach, beforeEach, describe, it } from "vitest";
import { assertEqual, I18n } from "@blazetrails/activesupport";
import "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";

class LocalizedController extends Base {
  helloWorld() {}
}

describe("LocalizedTemplatesTest", () => {
  class LocalizedTemplatesTest extends TestCase {
    declare oldLocale: ReturnType<typeof I18n.locale>;

    static {
      this.tests(LocalizedController);
    }
  }

  let tc: LocalizedTemplatesTest;

  beforeEach(async ({ task }) => {
    tc = new LocalizedTemplatesTest(task.name);
    await tc.beforeSetup();
    tc.setup();
    tc.oldLocale = I18n.locale();
  });

  afterEach(() => {
    I18n.setLocale(tc.oldLocale);
  });

  it("localized template is used", async () => {
    I18n.setLocale("de");
    await tc.get("helloWorld");
    assertEqual("Guten Tag", tc.response.body);
  });

  it("default locale template is used when locale is missing", async () => {
    I18n.setLocale("dk");
    await tc.get("helloWorld");
    assertEqual("Hello World", tc.response.body);
  });

  it("use fallback locales", async () => {
    I18n.setLocale("de-AT");
    (I18n.fallbacks() as Map<string, string[]>).set("de-AT", ["de"]);

    await tc.get("helloWorld");
    assertEqual("Guten Tag", tc.response.body);
  });

  it("localized template has correct header with no format in template name", async () => {
    I18n.setLocale("it");
    await tc.get("helloWorld");
    assertEqual("Ciao Mondo", tc.response.body);
    assertEqual("text/html", tc.response.mediaType);
  });

  it("use locale with lowdash", async () => {
    I18n.setLocale("de_AT");

    await tc.get("helloWorld");
    assertEqual("Guten Morgen", tc.response.body);
  });
});
