import { describe, expect, it } from "vitest";
import { Base, LookupContext, type Template } from "@blazetrails/actionview";
import { File } from "@blazetrails/ruby-compat";

const distTemplates = decodeURIComponent(new URL("../dist/templates", import.meta.url).pathname);

describe("WelcomeController shipped template", () => {
  it("renders rails/welcome/index from the module trailties' build emitted", async () => {
    const template = new LookupContext([distTemplates]).findTemplate(
      "index",
      ["rails/welcome"],
      false,
      [],
      {},
    ) as Template;
    expect(await File.isExist(`${template.identifier}.js`)).toBe(true);
    const html = String(
      await template.render(new (Base.withEmptyTemplateCache())(null, {}, null), {
        railsVersion: "8.0.2",
      }),
    );
    expect(html).toContain("<title>Ruby on Rails 8.0.2</title>");
  });
});
