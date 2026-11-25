import "../support/abstract-unit.js";

import { describe, expect, it } from "vitest";
import { Base } from "../../lib/base.js";
import { Template } from "../../lib/template.js";

const renderTse = async (string: string): Promise<string> => {
  const template = new Template(
    string.trim(),
    "test template",
    Template.handlerForExtension("tse")!,
    {
      format: ":html",
      locals: [],
    },
  );
  const view = Base.withEmptyTemplateCache();
  return String(await template.render(view.empty(), {})).trim();
};

describe("UrlHelperTest", () => {
  it("button to with a template block", async () => {
    const out = await renderTse(
      `<%= await buttonTo("http://www.example.com", { authenticity_token: false }, null, () => { %><span>Hello</span><% }) %>`,
    );
    expect(out).toBe(
      '<form class="button_to" method="post" action="http://www.example.com"><button type="submit"><span>Hello</span></button></form>',
    );
  });
});
