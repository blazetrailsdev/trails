import { afterEach, describe, expect, it } from "vitest";
import { LoadError, NotImplementedError } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { setTemplateCompiler, Template } from "../template.js";
import { buildViews } from "@blazetrails/trails-tsc";
import { TemplateHandlers } from "./handlers.js";
import { TSE } from "./handlers/tse.js";
import { shippedTemplateCompiler } from "../test-helpers/setup-compile-template.js";

const fixture = (name: string): string =>
  decodeURIComponent(new URL(`../../test-fixtures/${name}`, import.meta.url).pathname);
const view = (): Base => new (Base.withEmptyTemplateCache())(null, {}, null);
const find = (root: string, name: string, prefix: string): Template =>
  new LookupContext([`${root}/app/views`]).findTemplate(name, [prefix], false, [], {}) as Template;
const greeting = (root: string): Template => find(root, "show", "greetings");

describe("Templates are precompiled", () => {
  let testCompiler: ReturnType<typeof setTemplateCompiler> | undefined;
  const shipped = (): void => {
    testCompiler = setTemplateCompiler(shippedTemplateCompiler);
  };

  afterEach(() => {
    if (testCompiler) setTemplateCompiler(testCompiler);
    testCompiler = undefined;
  });

  it("renders a file-backed template from the module build-views emitted", async () => {
    shipped();
    expect(String(await greeting(fixture("precompiled")).render(view(), { name: "Ada" }))).toBe(
      "Hello, Ada!\n",
    );
  });

  it("raises LoadError for a file-backed template with no build", async () => {
    shipped();
    const error = await greeting(fixture("unbuilt"))
      .render(view(), { name: "Ada" })
      .catch((e: unknown) => e);
    expect((error as Error).cause).toBeInstanceOf(LoadError);
    expect(((error as Error).cause as Error).message).toBe(
      `cannot load such file -- ${fixture("unbuilt")}/.trails/views/greetings/show.html.tse.js`,
    );
  });

  it("raises NotImplementedError for a string-source template in shipped code", async () => {
    shipped();
    const template = new Template("<%= 1 %>", "inline template", new TSE(), {
      locals: [],
      format: ":html",
    });
    const error = await template.render(view()).catch((e: unknown) => e);
    expect((error as Error).cause).toBeInstanceOf(NotImplementedError);
  });

  it("compiles a string-source template with the test compiler installed", async () => {
    const template = new Template("<%= 1 + 1 %>", "inline template", new TSE(), {
      locals: [],
      format: ":html",
    });
    expect(String(await template.render(view()))).toBe("2");
  });

  it("leaves no eval, new Function or vm call in shipped actionview or tse-compiler source", async () => {
    // @ts-expect-error -- Property 'glob' does not exist on type 'ImportMeta'
    const globbed: Record<string, string> = import.meta.glob(
      ["../**/*.ts", "../../../tse-compiler/src/**/*.ts"],
      { query: "?raw", import: "default", eager: true },
    );
    const files = Object.entries(globbed).filter(
      ([file]) => !/\.test\.ts$|\/test-helpers\//u.test(file),
    );
    expect(files.length).toBeGreaterThan(100);
    const offenders = files
      .filter(([, source]) =>
        /\beval\s*[()]|(?<![\w$.])Function\s*\(|["'](?:node:)?vm["']/u.test(source),
      )
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("renders a file-backed raw template from the module build-views emitted", async () => {
    shipped();
    const template = find(fixture("precompiled"), "plain", "greetings");
    expect(String(await template.render(view()))).toBe("Raw <b>text</b>\n");
  });

  it("renders a file-backed html template from the module build-views emitted", async () => {
    shipped();
    const template = find(fixture("precompiled"), "banner", "greetings");
    expect(String(await template.render(view()))).toBe("<em>static</em>\n");
  });

  it("precompiles a file under a handler the application registers", async () => {
    const root = fixture("precompiled-handlers");
    try {
      const { files } = await buildViews({
        cwd: root,
        handlers: ["config/initializers/shout-handler.js"],
      });
      expect(files).toEqual(["greetings/loud.html.shout"]);
      shipped();
      const template = find(root, "loud", "greetings");
      expect(String(await template.render(view()))).toBe("HELLO <B>THERE</B>\n");
    } finally {
      TemplateHandlers.unregisterTemplateHandler("shout");
    }
  });

  it("builds each stand-in with the Tse handler options compile would use", async () => {
    const root = fixture("precompiled-options");
    const saved = [
      Base.annotateRenderedViewWithFilenames,
      TSE.tseTrimMode,
      TSE.stripTrailingNewlines,
      TSE.escapeIgnoreList,
    ] as const;
    Base.annotateRenderedViewWithFilenames = true;
    TSE.tseTrimMode = "<>";
    TSE.stripTrailingNewlines = true;
    TSE.escapeIgnoreList = [Template.Types.get(":text") as unknown as string];
    try {
      await buildViews({ cwd: root });
      const rendered: Record<string, string> = {};
      for (const name of ["annotated", "trimmed", "stripped", "escaped"]) {
        const template = find(root, name, "opts");
        shipped();
        rendered[name] = String(await template.render(view()));
        setTemplateCompiler(testCompiler!);
        testCompiler = undefined;
        const fromString = new Template(
          template.source,
          template.identifier.slice(root.length + 1),
          new TSE(),
          {
            locals: [],
            format: template.format,
          },
        );
        expect(rendered[name], name).toBe(String(await fromString.render(view())));
      }
      expect(rendered["annotated"]).toBe(
        `<!-- BEGIN app/views/opts/annotated.html.tse --><p>hi</p><!-- END app/views/opts/annotated.html.tse -->`,
      );
      expect(rendered["stripped"]).toContain("-->line\n<!-- END");
      expect(rendered["escaped"]).toBe("<b>");
    } finally {
      [
        Base.annotateRenderedViewWithFilenames,
        TSE.tseTrimMode,
        TSE.stripTrailingNewlines,
        TSE.escapeIgnoreList,
      ] = saved;
    }
  });
});
