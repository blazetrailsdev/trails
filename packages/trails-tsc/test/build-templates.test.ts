import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dir, File, FileUtils, NameError, TopLevel } from "@blazetrails/ruby-compat";
import { buildTemplates } from "../lib/build-templates.js";

describe("buildTemplates", () => {
  let root: string;
  beforeEach(() => {
    root = Dir.mktmpdir("trails-tsc-templates-");
  });
  afterEach(() => {
    FileUtils.rmRf(root);
  });

  const render = async (source: string, binding: object): Promise<string> => {
    const template = File.join(root, `t${Math.random().toString(36).slice(2)}.tt`);
    File.write(template, source);
    await buildTemplates([root]);
    const mod = (await import(`${template}.js`)) as { default: (this: object) => string };
    return mod.default.call(binding);
  };

  it("keeps scanning after a <%% literal, as ERB does", async () => {
    expect(await render('<%%= a(<%= "b" %>) %>', {})).toBe("<%= a(b) %>");
  });

  it("leaves a <%% inside a code tag alone", async () => {
    expect(await render('<%= "<%%" %>', {})).toBe("<%%");
  });

  it("turns a %%> inside a tag into a literal %>, as ERB does", async () => {
    expect(await render('<%= "%%>" %>', {})).toBe("%>");
  });

  it("resolves a free name when its line runs, not at render start", async () => {
    expect(await render("<% if (false) { %><%= missing %><% } %>ok", {})).toBe("ok");
  });

  it("raises NameError for a free name the binding does not answer", async () => {
    await expect(render("<%= missing %>", {})).rejects.toThrow(
      new NameError(
        "undefined local variable or method 'missing' for an instance of Hash",
        "missing",
      ),
    );
  });

  it("prefers the binding over a global of the same name", async () => {
    expect(await render("<%= fetch() %>", { fetch: () => "from binding" })).toBe("from binding");
  });

  it("reads the binding's methods with self bound", async () => {
    const binding = {
      name: "x",
      upper() {
        return this.name.toUpperCase();
      },
    };
    expect(await render("<%= upper() %>", binding)).toBe("X");
  });

  it("assigns a free name as a template local, never onto the binding", async () => {
    const binding = { title: "member" };
    expect(await render('<% title = "local" %><%= title %>', binding)).toBe("local");
    expect(binding.title).toBe("member");
  });

  it("resolves a top-level constant after the binding's self", async () => {
    const constants = TopLevel as Record<string, unknown>;
    constants.TemplateShared = "constant";
    constants.TemplateOnly = "top";
    try {
      expect(
        await render("<%= TemplateShared %> <%= TemplateOnly %>", { TemplateShared: "member" }),
      ).toBe("member top");
    } finally {
      delete constants.TemplateShared;
      delete constants.TemplateOnly;
    }
  });
});
