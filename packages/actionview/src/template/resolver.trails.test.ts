import { getOsAsync, getFs, getPath } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { I18n } from "@blazetrails/activesupport";

import { LookupContext } from "../lookup-context.js";
import { FileSystemResolver } from "./resolver.js";
import { FixtureResolver } from "../testing/resolvers.js";
import { TemplateHandlers } from "./handlers.js";
import type { Template } from "../template.js";
import { Tse } from "./handlers/tse.js";

describe("FileSystemResolver", () => {
  let dir: string;

  beforeEach(async () => {
    const fs = getFs();
    const path = getPath();
    const os = await getOsAsync();
    dir = await fs.mkdtemp!(`${os.tmpdir()}${path.sep}fs-resolver-`);
    await fs.mkdir!(path.join(dir, "posts"), { recursive: true });
    const write = (name: string, body: string) =>
      fs.writeFile!(path.join(dir, "posts", name), body);
    await write("index.html.tse", "<h1>Posts</h1>");
    await write("index.html+phone.tse", "<h1>Phone</h1>");
    await write("_form.html.tse", "<form></form>");
    await write("i*x.html.tse", "<h1>Star</h1>");
    await fs.mkdir!(path.join(dir, "po?sts"), { recursive: true });
    await fs.writeFile!(path.join(dir, "po?sts", "index.html.tse"), "<h1>Query</h1>");
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
  });

  afterEach(async () => {
    TemplateHandlers.clear();
    const fs = getFs();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("resolves a template through the same paths as exists?", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([new FileSystemResolver(dir)]);

    expect(ctx.isExists("index", ["posts"])).toBe(true);
    expect(ctx.isExists("missing", ["posts"])).toBe(false);
    expect((ctx.findTemplate("index", ["posts"]) as Template).source).toBe("<h1>Posts</h1>");
  });

  it("binds the requested locals, memoizing one template per locals set", () => {
    const resolver = new FileSystemResolver(dir);
    const details = { formats: [":html"], handlers: [":tse"] };

    const [bound] = resolver.findAll("index", "posts", false, details, null, ["b", "a"]);
    expect(bound.locals).toEqual(["a", "b"]);
    expect(resolver.findAll("index", "posts", false, details, {}, ["a", "b"])[0].locals).toEqual([
      "a",
      "b",
    ]);

    const key = {};
    const first = resolver.findAll("index", "posts", false, details, key, ["b", "a"])[0];
    expect(resolver.findAll("index", "posts", false, details, key, ["a", "b"])[0]).toBe(first);
    expect(resolver.findAll("index", "posts", false, details, key, [])[0]).not.toBe(first);
    expect(resolver.builtTemplates()).toContain(first);
  });

  it("can find with no extensions", async () => {
    await getFs().writeFile!(getPath().join(dir, "posts", "hello_world"), "Hello default!");

    const templates = new FileSystemResolver(dir).findAll("hello_world", "posts", false, {
      locale: ["en"],
      formats: [":html"],
      variants: ["phone"],
      handlers: [":tse"],
    });
    expect(templates).toHaveLength(1);
    expect(templates[0].source).toBe("Hello default!");
    expect(templates[0].virtualPath).toBe("posts/hello_world");
    expect(templates[0].format).toBeNull();
    expect(templates[0].variant).toBeNull();
  });

  it("strict locals reuses same template", async () => {
    await getFs().writeFile!(
      getPath().join(dir, "posts", "hello_world.html.tse"),
      '<%# locals: (message: "hello")%>\n<%= message %>',
    );
    const context = new LookupContext([new FileSystemResolver(dir)]);

    const template = context.findAll(
      "hello_world",
      ["posts"],
      false,
      ["message"],
      {},
    )[0] as Template;
    const template2 = context.findAll("hello_world", ["posts"], false, [], {})[0];

    expect(template2).toBe(template);

    expect(template.isStrictLocals()).toBe(true);
    expect(template.locals).toBeNull();
  });

  it("finds a partial through the same paths as exists?", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([new FileSystemResolver(dir)]);

    expect(ctx.isExists("form", ["posts"], true)).toBe(true);
    expect((ctx.findTemplate("form", ["posts"], true) as Template).source).toBe("<form></form>");
  });

  it("prefers the requested variant", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([new FileSystemResolver(dir)]);

    expect(ctx.isExists("index", ["posts"], false, [], { variants: ["phone"] })).toBe(true);
    expect(ctx.findAll("index", ["posts"], false, [], { variants: ["phone"] })).toHaveLength(2);
    expect(ctx.find("index", ["posts"], false, [], { variants: ["phone"] })).toMatchObject({
      source: "<h1>Phone</h1>",
    });
  });

  it("escapes glob metacharacters in the looked-up path", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([new FileSystemResolver(dir)]);

    expect((ctx.findTemplate("i*x", ["posts"]) as Template).source).toBe("<h1>Star</h1>");
    expect(ctx.isExists("i*dex", ["posts"])).toBe(false);
  });

  it("finds a template under a prefix containing a glob metacharacter", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([new FileSystemResolver(dir)]);

    expect(ctx.isExists("index", ["po?sts"])).toBe(true);
    expect((ctx.findTemplate("index", ["po?sts"]) as Template).source).toBe("<h1>Query</h1>");
  });

  it("rescans the filesystem when the details cache is off", async () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([new FileSystemResolver(dir)]);
    expect(ctx.isExists("index", ["posts"])).toBe(true);

    const fs = getFs();
    const path = getPath();
    await fs.writeFile!(path.join(dir, "posts", "index.html+tablet.tse"), "<h1>Tablet</h1>");

    expect(
      ctx.disableCache(() => ctx.find("index", ["posts"], false, [], { variants: ["tablet"] })),
    ).toMatchObject({ source: "<h1>Tablet</h1>" });
  });

  it("any? ignores the format and variant constraints", () => {
    const ctx = new LookupContext(null, { formats: [":json"] }, []);
    ctx.appendViewPaths([new FileSystemResolver(dir)]);

    expect(ctx.isExists("index", ["posts"])).toBe(false);
    expect(ctx.isAny("index", ["posts"])).toBe(true);
    expect(ctx.isAny("missing", ["posts"])).toBe(false);
  });
});

describe("FixtureResolver", () => {
  it("globs with File.fnmatch semantics, where ** requires a directory", () => {
    const resolver = new FixtureResolver({
      "index.html.tse": "root",
      "posts/index.html.tse": "nested",
    });

    expect(resolver.allTemplatePaths().map((path) => path.virtual)).toEqual(["posts/index"]);
  });
});

describe("PathParser locales", () => {
  let originalLocale: ReturnType<typeof I18n.locale>;

  beforeEach(() => {
    originalLocale = I18n.locale();
    I18n.setEnforceAvailableLocales(false);
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
  });

  afterEach(() => {
    I18n.setLocale(originalLocale);
    I18n.setAvailableLocales(null);
    I18n.setEnforceAvailableLocales(true);
    TemplateHandlers.clear();
  });

  it("resolves a dashed-locale template when the locale is pt-BR", () => {
    const resolver = new FixtureResolver({
      "posts/show.html.tse": "Hello world",
      "posts/show.pt-BR.html.tse": "Ola mundo",
    });
    I18n.setLocale("pt-BR");
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([resolver]);

    expect((ctx.findTemplate("show", ["posts"]) as Template).source).toBe("Ola mundo");
  });

  it("unions I18n.available_locales into the locale group, rebuilt by clear_cache", () => {
    const resolver = new FixtureResolver({ "posts/show.sr-Latn.html.tse": "Zdravo svete" });
    I18n.setLocale("sr-Latn");
    const before = new LookupContext(null, {}, []);
    before.appendViewPaths([resolver]);
    expect(before.isExists("show", ["posts"])).toBe(false);

    I18n.setAvailableLocales(["en", "sr-Latn"]);
    resolver.clearCache();
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([resolver]);

    expect((ctx.findTemplate("show", ["posts"]) as Template).source).toBe("Zdravo svete");
  });
});
