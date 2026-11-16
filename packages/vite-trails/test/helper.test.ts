import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  assertEqual,
  assertIncludes,
  assertNil,
} from "@blazetrails/activesupport/testing/assertions";
import {
  applyStylesheetMediaDefault,
  setApplyStylesheetMediaDefault,
} from "@blazetrails/actionview/helpers/asset-tag-helper.js";
import { TestCase } from "@blazetrails/actionview/test-case.js";
import { setEnv } from "@blazetrails/ruby-compat";
import { ViteAssets } from "@blazetrails/vite-assets";
import "../lib/config.js";
import { TagHelpers } from "../lib/tag-helpers.js";

type Tc = {
  [K in keyof typeof TagHelpers]: OmitThisParameter<(typeof TagHelpers)[K]>;
} & {
  request: unknown;
  beforeSetup(): Promise<void>;
  setup(): void;
};

type TestCaseClass = (new (name: string) => TestCase) & { tests(helperClass: unknown): void };

function link({
  href,
  rel = "stylesheet",
  media = "screen",
  crossorigin = null,
}: {
  href: string;
  rel?: string;
  media?: string;
  crossorigin?: string | null;
}): string {
  const attrs = [
    `media="${media}"`,
    `href="${href}"`,
    crossorigin != null ? `crossorigin="${crossorigin}"` : null,
  ].filter((attr) => attr != null);
  attrs.reverse();
  return `<link rel="${rel}" ${attrs.join(" ")} />`;
}

function assertSimilar(expected: unknown, actual: unknown): void {
  assertEqual(String(expected).replaceAll("\n", ""), String(actual).replaceAll("\n", ""));
}

setEnv("VITE_RUBY_SKIP_COMPATIBILITY_CHECK", "true");

function refreshConfig(options: Record<string, unknown> = {}): Promise<unknown> {
  return ViteAssets.reloadWith({
    root: new URL("../../vite-assets/test/test_app", import.meta.url).pathname,
    mode: "production",
    ...options,
  }).config();
}

async function withDevServerRunning(block: () => unknown): Promise<void> {
  await refreshConfig({ mode: "development" });
  try {
    const spy = vi.spyOn(ViteAssets.instance(), "isDevServerRunning").mockResolvedValue(true);
    try {
      await block();
    } finally {
      spy.mockRestore();
    }
  } finally {
    await refreshConfig();
  }
}

async function withSkipProxyDevServerRunning(block: () => unknown): Promise<void> {
  await refreshConfig({ mode: "development", skipProxy: true });
  const spy = vi.spyOn(ViteAssets.instance(), "isDevServerRunning").mockResolvedValue(true);
  try {
    await block();
  } finally {
    spy.mockRestore();
    await refreshConfig();
  }
}

const REACT_PREAMBLE = (
  origin: string,
) => `import RefreshRuntime from '${origin}/vite-dev/@react-refresh'
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
`;

describe("LegacyHelperTest", () => {
  // PERMANENT-SKIP: vite_plugin_legacy is not ported (CLAUDE.md, "importmap-rails and propshaft are out of scope; JavaScript is served by Vite (`vite_rails`)").
  it.skip("plugin legacy", () => {});
});

class HelperTest extends TestCase {
  contentSecurityPolicyNonce(): string {
    return "iyhD0Yc0W+c=";
  }
}
(HelperTest as unknown as TestCaseClass).tests(TagHelpers);

describe("HelperTest", () => {
  let tc: Tc;
  const originalApplyStylesheetMediaDefault = applyStylesheetMediaDefault;
  afterEach(() => setApplyStylesheetMediaDefault(originalApplyStylesheetMediaDefault));
  beforeEach(async ({ task }) => {
    setApplyStylesheetMediaDefault(true);
    tc = new (HelperTest as unknown as TestCaseClass)(task.name) as unknown as Tc;
    await tc.beforeSetup();
    tc.setup();
    tc.request = {
      sendEarlyHints(_links: unknown) {},
      get baseUrl() {
        return "https://example.com";
      },
    };
    await refreshConfig();
  });

  it("vite client tag", async () => {
    assertNil(await tc.viteClientTag());
    await withDevServerRunning(async () => {
      assertEqual(
        '<script src="/vite-dev/@vite/client" crossorigin="anonymous" type="module"></script>',
        String(await tc.viteClientTag()),
      );
    });
  });

  it("vite asset path", async () => {
    assertEqual("/vite-production/assets/main.9dcad042.js", await tc.viteAssetPath("main.ts"));
    assertEqual("/vite-production/assets/app.517bf154.css", await tc.viteAssetPath("app.css"));
    assertEqual(
      "/vite-production/assets/logo.322aae0c.svg",
      await tc.viteAssetPath("images/logo.svg"),
    );
    assertEqual(
      "/vite-production/assets/theme.e6d9734b.css",
      await tc.viteAssetPath("/app/assets/theme.css"),
    );
    await withDevServerRunning(async () => {
      assertEqual("/vite-dev/entrypoints/main.ts", await tc.viteAssetPath("main.ts"));
      assertEqual("/vite-dev/entrypoints/app.css", await tc.viteAssetPath("app.css"));
      assertEqual("/vite-dev/images/logo.png", await tc.viteAssetPath("images/logo.png"));
    });
  });

  it("vite asset url", async () => {
    assertEqual(
      "https://example.com/vite-production/assets/main.9dcad042.js",
      await tc.viteAssetUrl("main.ts"),
    );
    await withDevServerRunning(async () => {
      assertEqual(
        "https://example.com/vite-dev/entrypoints/main.ts",
        await tc.viteAssetUrl("main.ts"),
      );
    });
  });

  it("vite stylesheet tag", async () => {
    assertSimilar(
      link({ href: "/vite-production/assets/app.517bf154.css" }),
      await tc.viteStylesheetTag("app"),
    );
    assertEqual(
      String(await tc.viteStylesheetTag("app")),
      String(await tc.viteStylesheetTag("app.css")),
    );
    assertSimilar(
      link({ href: "/vite-production/assets/sassy.3560956f.css" }),
      await tc.viteStylesheetTag("sassy.scss"),
    );

    await withDevServerRunning(async () => {
      assertSimilar(
        link({ href: "/vite-dev/entrypoints/app.css" }),
        await tc.viteStylesheetTag("app"),
      );
      assertEqual(
        String(await tc.viteStylesheetTag("app")),
        String(await tc.viteStylesheetTag("app.css")),
      );
      assertSimilar(
        link({ href: "/vite-dev/entrypoints/sassy.scss" }),
        await tc.viteStylesheetTag("sassy.scss"),
      );
    });
  });

  it("vite preload tag", async () => {
    assertIncludes(
      String(await tc.viteTypescriptTag("main", { host: "example.com", protocol: "https" })),
      [
        `<link rel="modulepreload" href="https://example.com/vite-production/assets/log.818edfb8.js" as="script" crossorigin="">`,
        `<link rel="modulepreload" href="https://example.com/vite-production/assets/vendor.0f7c0ec3.js" as="script" crossorigin="">`,
        `<link rel="modulepreload" href="https://example.com/vite-production/assets/vue.3002ada6.js" as="script" crossorigin="">`,
      ].join("\n"),
    );
  });

  it("vite javascript tag", async () => {
    assertSimilar(
      [
        `<script src="/vite-production/assets/main.9dcad042.js" crossorigin="" type="module"></script>`,
        `<link rel="modulepreload" href="/vite-production/assets/log.818edfb8.js" as="script" crossorigin="">`,
        `<link rel="modulepreload" href="/vite-production/assets/vendor.0f7c0ec3.js" as="script" crossorigin="">`,
        `<link rel="modulepreload" href="/vite-production/assets/vue.3002ada6.js" as="script" crossorigin="">`,
        link({ href: "/vite-production/assets/app.517bf154.css", crossorigin: "" }),
        link({ href: "/vite-production/assets/theme.e6d9734b.css", crossorigin: "" }),
        link({ href: "/vite-production/assets/vue.ec0a97cc.css", crossorigin: "" }),
      ].join(""),
      await tc.viteTypescriptTag("main"),
    );

    assertEqual(
      String(await tc.viteJavascriptTag("main.ts")),
      String(await tc.viteTypescriptTag("main")),
    );

    assertEqual(
      String(await tc.viteJavascriptTag("entrypoints/frameworks/vue")),
      String(await tc.viteJavascriptTag("~/entrypoints/frameworks/vue.js")),
    );

    await withDevServerRunning(async () => {
      assertEqual(
        `<script src="/vite-dev/entrypoints/frameworks/vue.js" crossorigin="" type="module"></script>`,
        String(await tc.viteJavascriptTag("entrypoints/frameworks/vue")),
      );

      assertEqual(
        `<script src="/vite-dev/entrypoints/main.ts" crossorigin="" type="module"></script>`,
        String(await tc.viteTypescriptTag("main")),
      );
    });
  });

  it("vite react refresh tag without nonce", async () => {
    assertNil(await tc.viteReactRefreshTag());
    await withDevServerRunning(async () => {
      assertEqual(
        `<script type="module">\n//<![CDATA[\n${REACT_PREAMBLE("")}\n//]]>\n</script>`,
        String(await tc.viteReactRefreshTag({ nonce: null })),
      );
    });
  });

  it("vite react refresh tag with nonce by default", async () => {
    await withDevServerRunning(async () => {
      assertEqual(
        `<script type="module" nonce="iyhD0Yc0W+c=">\n//<![CDATA[\n${REACT_PREAMBLE("")}\n//]]>\n</script>`,
        String(await tc.viteReactRefreshTag()),
      );
    });
  });

  it("vite image tag", async () => {
    assertEqual(
      `<img class="test" alt="Logo" src="/vite-production/assets/logo.f42fb7ea.png" />`,
      String(await tc.viteImageTag("images/logo.png", { class: "test", alt: "Logo" })),
    );

    assertEqual(
      `<img srcset="/vite-production/assets/logo-2x.bs8d7a77.png 2x" alt="Logo" src="/vite-production/assets/logo.f42fb7ea.png" />`,
      String(
        await tc.viteImageTag("images/logo.png", {
          srcset: { "images/logo-2x.png": "2x" },
          alt: "Logo",
        }),
      ),
    );

    await withDevServerRunning(async () => {
      assertEqual(
        `<img alt="Logo" src="/vite-dev/images/logo.png" />`,
        String(await tc.viteImageTag("images/logo.png", { alt: "Logo" })),
      );

      assertEqual(
        `<img srcset="/vite-dev/images/logo-2x.png 2x" alt="Logo" src="/vite-dev/images/logo.png" />`,
        String(
          await tc.viteImageTag("images/logo.png", {
            srcset: { "images/logo-2x.png": "2x" },
            alt: "Logo",
          }),
        ),
      );
    });
  });

  it("vite client tag with skip proxy", async () => {
    assertNil(await tc.viteClientTag());
    await withSkipProxyDevServerRunning(async () => {
      const origin = (await ViteAssets.config()).origin();

      assertEqual(
        `<script src="${origin}/vite-dev/@vite/client" crossorigin="anonymous" type="module"></script>`,
        String(await tc.viteClientTag()),
      );
    });
  });

  it("vite asset path with skip proxy", async () => {
    await withSkipProxyDevServerRunning(async () => {
      const origin = (await ViteAssets.config()).origin();

      assertEqual(`${origin}/vite-dev/entrypoints/main.ts`, await tc.viteAssetPath("main.ts"));
      assertEqual(`${origin}/vite-dev/entrypoints/app.css`, await tc.viteAssetPath("app.css"));
      assertEqual(`${origin}/vite-dev/images/logo.png`, await tc.viteAssetPath("images/logo.png"));
    });
  });

  it("vite javascript tag with skip proxy", async () => {
    await withSkipProxyDevServerRunning(async () => {
      const origin = (await ViteAssets.config()).origin();

      assertEqual(
        `<script src="${origin}/vite-dev/entrypoints/main.ts" crossorigin="" type="module"></script>`,
        String(await tc.viteTypescriptTag("main")),
      );

      assertEqual(
        `<script src="${origin}/vite-dev/entrypoints/frameworks/vue.js" crossorigin="" type="module"></script>`,
        String(await tc.viteJavascriptTag("entrypoints/frameworks/vue")),
      );
    });
  });

  it("vite stylesheet tag with skip proxy", async () => {
    await withSkipProxyDevServerRunning(async () => {
      const origin = (await ViteAssets.config()).origin();

      assertSimilar(
        link({ href: `${origin}/vite-dev/entrypoints/app.css` }),
        await tc.viteStylesheetTag("app"),
      );
      assertEqual(
        String(await tc.viteStylesheetTag("app")),
        String(await tc.viteStylesheetTag("app.css")),
      );

      assertSimilar(
        link({ href: `${origin}/vite-dev/entrypoints/sassy.scss` }),
        await tc.viteStylesheetTag("sassy.scss"),
      );
    });
  });

  it("vite image tag with skip proxy", async () => {
    await withSkipProxyDevServerRunning(async () => {
      const origin = (await ViteAssets.config()).origin();

      assertEqual(
        `<img alt="Logo" src="${origin}/vite-dev/images/logo.png" />`,
        String(await tc.viteImageTag("images/logo.png", { alt: "Logo" })),
      );

      assertEqual(
        `<img srcset="${origin}/vite-dev/images/logo-2x.png 2x" alt="Logo" src="${origin}/vite-dev/images/logo.png" />`,
        String(
          await tc.viteImageTag("images/logo.png", {
            srcset: { "images/logo-2x.png": "2x" },
            alt: "Logo",
          }),
        ),
      );
    });
  });

  it("vite react refresh tag with skip proxy", async () => {
    await withSkipProxyDevServerRunning(async () => {
      const origin = (await ViteAssets.config()).origin();

      assertEqual(
        `<script type="module">\n//<![CDATA[\n${REACT_PREAMBLE(origin)}\n//]]>\n</script>`,
        String(await tc.viteReactRefreshTag({ nonce: null })),
      );
    });
  });

  it("vite picture tag", async () => {
    assertEqual(
      `<picture class="test"><source srcset="/vite-production/assets/logo.322aae0c.svg" type="image/svg+xml" /><source srcset="/vite-production/assets/logo.f42fb7ea.png" type="image/png" /><img alt="Logo" src="/vite-production/assets/logo.f42fb7ea.png" /></picture>`,
      String(
        await tc.vitePictureTag("images/logo.svg", "images/logo.png", {
          class: "test",
          image: { alt: "Logo" },
        }),
      ),
    );
  });
});
