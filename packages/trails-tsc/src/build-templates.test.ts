import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { buildTemplates } from "./build-templates.js";

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

  it("resolves a free name when its line runs, not at render start", async () => {
    expect(await render("<% if (false) { %><%= missing %><% } %>ok", {})).toBe("ok");
  });

  it("raises ReferenceError for a free name the binding does not answer", async () => {
    await expect(render("<%= missing %>", {})).rejects.toThrow(
      new ReferenceError("missing is not defined"),
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
});
