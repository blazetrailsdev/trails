import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../lib/config.js";
import type { EntryType, ManifestEntry } from "../lib/manifest.js";
import { MissingEntrypointError } from "../lib/missing-entrypoint-error.js";
import { ViteRuby } from "../lib/vite-ruby.js";
import { refreshConfig, stubBuilder, withDevServerRunning } from "./support/test-helper.js";

type Options = { type?: EntryType };
type Exposed = {
  pathFor(name: string, options?: Options): Promise<string>;
  lookup(name: string, options?: Options): Promise<ManifestEntry | null>;
  lookupBang(name: string, options?: Options): Promise<ManifestEntry>;
  resolveEntryName(name: string, options?: Options): Promise<string>;
  viteClientSrc(): Promise<string | null>;
};
const manifest = () => ViteRuby.instance().manifest() as unknown as Exposed;
const pathFor = (name: string, options?: Options) => manifest().pathFor(name, options);
const lookup = (name: string, options?: Options) => manifest().lookup(name, options);
const lookupBang = (name: string, options?: Options) => manifest().lookupBang(name, options);
const resolveEntryName = (name: string, options?: Options) =>
  manifest().resolveEntryName(name, options);
const viteClientSrc = () => manifest().viteClientSrc();

async function assertRaisesManifestMissingEntryError(
  block: () => Promise<unknown>,
  { autoBuild = false } = {},
): Promise<MissingEntrypointError> {
  const config: Config = await ViteRuby.config();
  const spy = vi.spyOn(config, "autoBuild", "get").mockReturnValue(autoBuild);
  try {
    const error = await block().then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(MissingEntrypointError);
    return error as MissingEntrypointError;
  } finally {
    spy.mockRestore();
  }
}

const manifestPath = "public/vite-production/.vite/manifest.json";
const prefixed = (file: string) => `/vite-production/assets/${file}`;

describe("ManifestTest", () => {
  beforeEach(async () => {
    await refreshConfig();
  });

  afterEach(async () => {
    await refreshConfig();
  });

  it("resolve entry name", async () => {
    expect(await resolveEntryName("application", { type: "javascript" })).toBe(
      "entrypoints/application.js",
    );
    expect(await resolveEntryName("application.js", { type: "javascript" })).toBe(
      "entrypoints/application.js",
    );
    expect(await resolveEntryName("application.js")).toBe("entrypoints/application.js");
    expect(await resolveEntryName("application", { type: "typescript" })).toBe(
      "entrypoints/application.ts",
    );
    expect(await resolveEntryName("application.ts", { type: "typescript" })).toBe(
      "entrypoints/application.ts",
    );

    expect(await resolveEntryName("styles", { type: "stylesheet" })).toBe("entrypoints/styles.css");
    expect(await resolveEntryName("styles.css", { type: "stylesheet" })).toBe(
      "entrypoints/styles.css",
    );
    expect(await resolveEntryName("styles.css")).toBe("entrypoints/styles.css");
    expect(await resolveEntryName("styles.scss", { type: "stylesheet" })).toBe(
      "entrypoints/styles.scss",
    );

    expect(await resolveEntryName("logo.svg")).toBe("entrypoints/logo.svg");
    expect(await resolveEntryName("images/logo.svg")).toBe("images/logo.svg");
    expect(await resolveEntryName("~/images/logo.svg")).toBe("images/logo.svg");
    expect(await resolveEntryName("~/favicon.ico")).toBe("favicon.ico");
    expect(await resolveEntryName("/package.json")).toBe("../../package.json");
    expect(await resolveEntryName("/images/logo.svg")).toBe("../../images/logo.svg");
    expect(await resolveEntryName("/app/assets/theme.css")).toBe("../assets/theme.css");

    await withDevServerRunning(async () => {
      const root = (await ViteRuby.config()).root;
      expect(await resolveEntryName("logo.svg")).toBe("entrypoints/logo.svg");
      expect(await resolveEntryName("images/logo.svg")).toBe("images/logo.svg");
      expect(await resolveEntryName("~/images/logo.svg")).toBe("images/logo.svg");
      expect(await resolveEntryName("~/favicon.ico")).toBe("favicon.ico");
      expect(await resolveEntryName("/package.json")).toBe(`/@fs${root}/package.json`);
      expect(await resolveEntryName("/images/logo.svg")).toBe(`/@fs${root}/images/logo.svg`);
      expect(await resolveEntryName("/app/assets/theme.css")).toBe(
        `/@fs${root}/app/assets/theme.css`,
      );
    });

    expect(await resolveEntryName("entrypoints/application.js")).toBe("entrypoints/application.js");
  });

  it("lookup exception!", async () => {
    await stubBuilder({ buildSuccessful: true }, async () => {
      let assetFile = "calendar.js";
      let error = await assertRaisesManifestMissingEntryError(() => pathFor(assetFile));

      expect(error.message).toMatch(
        `Vite Ruby can't find entrypoints/${assetFile} in the manifests`,
      );
      expect(error.message).toMatch('"autoBuild" is set to `false`');

      assetFile = "images/logo.gif";
      error = await assertRaisesManifestMissingEntryError(() => pathFor(assetFile));

      expect(error.message).toMatch(`Vite Ruby can't find ${assetFile} in the manifests`);

      assetFile = "/app/styles/theme.css";
      error = await assertRaisesManifestMissingEntryError(() => pathFor(assetFile));

      expect(error.message).toMatch("Vite Ruby can't find ../styles/theme.css in the manifests");

      assetFile = "~/favicon.ico";
      error = await assertRaisesManifestMissingEntryError(() => pathFor(assetFile));

      expect(error.message).toMatch("Vite Ruby can't find favicon.ico in the manifests");

      expect(error.message).toMatch(`Manifest files found:\n  ${manifestPath}`);
    });
  });

  it("lookup exception when auto build", async () => {
    await stubBuilder({ buildSuccessful: true }, async () => {
      const assetFile = "calendar.js";

      const error = await assertRaisesManifestMissingEntryError(() => pathFor(assetFile), {
        autoBuild: true,
      });

      expect(error.message).toMatch(
        `Vite Ruby can't find entrypoints/${assetFile} in the manifests`,
      );
      expect(error.message).toMatch("The file path is incorrect.");
    });
  });

  it("lookup exception when build failed", async () => {
    const errorLines = ["SyntaxError: Hero.jsx: Unexpected token (6:6)", "  4 |   return <>"];
    await stubBuilder({ buildSuccessful: false, buildErrors: errorLines.join("\n") }, async () => {
      const assetFile = "calendar.js";

      const error = await assertRaisesManifestMissingEntryError(() => pathFor(assetFile));

      expect(error.message).toMatch(
        `Vite Ruby can't find entrypoints/${assetFile} in the manifests`,
      );
      expect(error.message).toMatch("The last build failed.");
      expect(error.message).toMatch(`  ${errorLines[0]}`);
      expect(error.message).toMatch(`  ${errorLines[1]}`);
    });
  });

  it("lookup with type exception!", async () => {
    await stubBuilder({ buildSuccessful: false }, async () => {
      const assetFile = "calendar";

      const error = await assertRaisesManifestMissingEntryError(() =>
        pathFor(assetFile, { type: "javascript" }),
      );

      expect(error.message).toMatch(
        `Vite Ruby can't find entrypoints/${assetFile}.js in the manifests`,
      );
    });
  });

  it("lookup success!", async () => {
    const vendorChunk = {
      file: prefixed("vendor.0f7c0ec3.js"),
      css: [prefixed("vue.ec0a97cc.css")],
    };
    const entry = {
      file: prefixed("main.9dcad042.js"),
      src: "entrypoints/main.ts",
      isEntry: true,
      imports: [
        { file: prefixed("log.818edfb8.js") },
        {
          file: prefixed("vue.3002ada6.js"),
          src: "entrypoints/frameworks/vue.js",
          isEntry: true,
          imports: [vendorChunk],
          assets: [prefixed("logo.322aae0c.svg")],
        },
      ],
      css: [prefixed("app.517bf154.css"), prefixed("theme.e6d9734b.css")],
    };

    expect(await pathFor("main", { type: "typescript" })).toBe(entry.file);
    expect(await lookupBang("main.ts", { type: "javascript" })).toEqual(entry);
    expect(await lookupBang("main", { type: "typescript" })).toEqual(
      await lookupBang("main.ts", { type: "javascript" }),
    );
    expect(await lookupBang("entrypoints/main", { type: "typescript" })).toEqual(
      await lookupBang("main.ts"),
    );
  });

  it("lookup success with dev server running!", async () => {
    await refreshConfig({ mode: "development" });
    await withDevServerRunning(async () => {
      const root = (await ViteRuby.config()).root;
      const entry = { file: "/vite-dev/entrypoints/application.js" };

      expect(await lookupBang("application.js", { type: "javascript" })).toEqual(entry);
      expect(await lookupBang("entrypoints/application.js")).toEqual(entry);

      expect(await pathFor("application", { type: "typescript" })).toBe(
        "/vite-dev/entrypoints/application.ts",
      );

      expect(await pathFor("styles", { type: "stylesheet" })).toBe(
        "/vite-dev/entrypoints/styles.css",
      );

      expect(await pathFor("image/logo.png")).toBe("/vite-dev/image/logo.png");

      expect(await pathFor("~/logo.png")).toBe("/vite-dev/logo.png");

      expect(await pathFor("/app/assets/theme", { type: "stylesheet" })).toBe(
        `/vite-dev/@fs${root}/app/assets/theme.css`,
      );
    });
  });

  it("vite client src", async () => {
    await refreshConfig({ mode: "development" });

    expect(await viteClientSrc()).toBeNull();

    await withDevServerRunning(async () => {
      expect(await viteClientSrc()).toBe("/vite-dev/@vite/client");
    });

    await refreshConfig({ assetHost: "http://example.com", mode: "development" });

    await withDevServerRunning(async () => {
      expect(await viteClientSrc()).toBe("http://example.com/vite-dev/@vite/client");
    });
  });

  it("lookup success with skip proxy and dev server running", async () => {
    await refreshConfig({ mode: "development", skipProxy: true });
    await withDevServerRunning(async () => {
      const config = await ViteRuby.config();
      const origin = config.origin();
      const root = config.root;

      const entry = { file: `${origin}/vite-dev/entrypoints/application.js` };

      expect(await lookupBang("application.js", { type: "javascript" })).toEqual(entry);
      expect(await lookupBang("entrypoints/application.js")).toEqual(entry);

      expect(await pathFor("application", { type: "typescript" })).toBe(
        `${origin}/vite-dev/entrypoints/application.ts`,
      );

      expect(await pathFor("styles", { type: "stylesheet" })).toBe(
        `${origin}/vite-dev/entrypoints/styles.css`,
      );

      expect(await pathFor("image/logo.png")).toBe(`${origin}/vite-dev/image/logo.png`);

      expect(await pathFor("~/logo.png")).toBe(`${origin}/vite-dev/logo.png`);

      expect(await pathFor("/app/assets/theme", { type: "stylesheet" })).toBe(
        `${origin}/vite-dev/@fs${root}/app/assets/theme.css`,
      );
    });
  });

  it("vite client src with skip proxy", async () => {
    await refreshConfig({ mode: "development", skipProxy: true });

    expect(await viteClientSrc()).toBeNull();

    await withDevServerRunning(async () => {
      expect(await viteClientSrc()).toBe(
        `${(await ViteRuby.config()).origin()}/vite-dev/@vite/client`,
      );
    });

    await refreshConfig({ assetHost: "http://example.com", mode: "development", skipProxy: true });

    await withDevServerRunning(async () => {
      expect(await viteClientSrc()).toBe(
        `${(await ViteRuby.config()).origin()}/vite-dev/@vite/client`,
      );
    });
  });

  it("skip proxy has no effect without dev server", async () => {
    await refreshConfig({ skipProxy: true });

    expect(await pathFor("main", { type: "typescript" })).toBe(prefixed("main.9dcad042.js"));
    expect(await pathFor("app", { type: "stylesheet" })).toBe(prefixed("app.517bf154.css"));
    expect(await pathFor("images/logo.png")).toBe(prefixed("logo.f42fb7ea.png"));
  });

  it("lookup nil", async () => {
    expect(await lookup("foo.js")).toBeNull();
  });

  it("lookup nested entrypoint", async () => {
    expect(await lookup("frameworks/vue.js")).toBeNull();

    const file = prefixed("vue.3002ada6.js");

    expect(await pathFor("entrypoints/frameworks/vue.js")).toBe(file);
    expect(await pathFor("~/entrypoints/frameworks/vue.js")).toBe(file);
    expect(await lookup("~/entrypoints/frameworks/vue", { type: "javascript" })).toEqual(
      await lookup("entrypoints/frameworks/vue.js"),
    );
  });

  it("path for assets", async () => {
    expect(await pathFor("images/logo.png")).toBe(prefixed("logo.f42fb7ea.png"));
    expect(await pathFor("~/images/logo.png")).toBe(prefixed("logo.f42fb7ea.png"));

    expect(await pathFor("/app/assets/external", { type: "javascript" })).toBe(
      prefixed("external.d1ae13f1.js"),
    );
    expect(await pathFor("/app/assets/logo.png")).toBe(prefixed("logo.03d6d6da.png"));
    expect(await pathFor("/app/assets/theme", { type: "stylesheet" })).toBe(
      prefixed("theme.e6d9734b.css"),
    );
  });

  it("lookup success", async () => {
    let entry = { file: prefixed("app.517bf154.css"), src: "entrypoints/app.css" };

    expect(await lookup("app.css")).toEqual(entry);
    expect(await lookup("app.css", { type: "stylesheet" })).toEqual(entry);
    expect(await lookup("app", { type: "stylesheet" })).toEqual(entry);

    entry = { file: prefixed("logo.322aae0c.svg"), src: "images/logo.svg" };

    expect(await lookup("images/logo.svg")).toEqual(entry);
  });
});
