import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HTML5 } from "@blazetrails/nokogiri";
import { isPresent } from "@blazetrails/activesupport";
import { constGet, TopLevel } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../test-helper.ts";
import { isolateEmbedProviders, setEmbedProviders } from "../embed-providers-env.ts";
import type { Account } from "../../app/models/account.ts";
import { ApplicationController } from "../../app/controllers/application-controller.ts";
import { EmbedProvider } from "../../app/models/embed-provider.ts";

const PAGE_PATH = "/session/new";

const sha256 = (text: string) => createHash("sha256").update(text).digest("base64");

describe("ContentSecurityPolicyTest", () => {
  isolateEmbedProviders();

  let t: ApplicationIntegrationTest;

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
  });

  const csp = () =>
    (t.response.headers.get("content-security-policy") as string | null | undefined) ?? undefined;

  // What DISABLE_CONTENT_SECURITY_POLICY=true leaves at boot: no application policy
  async function withoutPolicy(block: () => Promise<void>): Promise<void> {
    const envConfig = Trails.application.envConfig();
    const previous = envConfig["action_dispatch.content_security_policy"];
    delete envConfig["action_dispatch.content_security_policy"];
    try {
      await block();
    } finally {
      envConfig["action_dispatch.content_security_policy"] = previous;
    }
  }

  async function withAssetHost(assetHost: unknown, block: () => Promise<void>): Promise<void> {
    const klass = ApplicationController as unknown as { assetHost: unknown };
    const previous = klass.assetHost;
    klass.assetHost = assetHost;
    try {
      await block();
    } finally {
      klass.assetHost = previous;
    }
  }

  async function frameSrcTokens(): Promise<string[]> {
    await t.get("/session/new");
    t.assertResponse(":success");

    const header = csp();
    expect(isPresent(header), "expected a Content-Security-Policy header").toBe(true);

    const frameSrc = header!
      .split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith("frame-src"));
    expect(isPresent(frameSrc), `expected a frame-src directive, got: ${header}`).toBe(true);

    return frameSrc!.split(/\s+/).slice(1);
  }

  const scriptSrc = () => /script-src ([^;]+)/.exec(csp()!)![1].split(/\s+/).filter(Boolean);

  it("no frame-src is sent while embeds are permissive", async () => {
    await t.get("/session/new");
    t.assertResponse(":success");

    expect(csp()).not.toMatch("frame-src");
  });

  it("enforcing script policy allows exactly the inline scripts the page carries", async () => {
    await t.get("/session/new");
    t.assertResponse(":success");

    const policy = csp();
    expect(policy, "expected an enforcing Content-Security-Policy header").toBeTruthy();
    expect(t.response.headers.get("content-security-policy-report-only")).toBeUndefined();
    expect(policy).toMatch("object-src 'none'");
    expect(policy).toMatch("base-uri 'self'");
    expect(policy).not.toMatch("unsafe-inline");
    expect(policy).not.toMatch("nonce-");
    expect(String(t.response.headers.get("set-cookie") ?? "").match(/nonce/gi) ?? []).toEqual([]);

    const sources = scriptSrc();
    const inline = HTML5.Document.parse(t.response.body)
      .css("script")
      .toA()
      .filter((s) => s.get("src") == null);
    // PERMANENT-SKIP: `assert_operator inline.size, :>=, 2` counts importmap-rails'
    // two inline scripts; this app's JavaScript is served by Vite, which emits none
    // (CLAUDE.md, "importmap-rails and propshaft are out of scope").
    for (const script of inline) {
      expect(sources, `inline ${script.get("type")} script not allowed by hash`).toContain(
        `'sha256-${sha256(script.text)}'`,
      );
    }
  });

  it("scripts may load from a configured asset host, however it's written", async () => {
    const cases: [unknown, RegExp][] = [
      ["https://cdn.example.test", /^https:\/\/cdn\.example\.test$/],
      ["cdn.example.test", /^http:\/\/cdn\.example\.test$/],
      ["//cdn.example.test", /^http:\/\/cdn\.example\.test$/],
      ["https://assets%d.example.test", /^https:\/\/assets[0-3]\.example\.test$/],
      [(_source: string) => "https://one.example.test", /^https:\/\/one\.example\.test$/],
      [
        (_source: string, request: { host: string }) => `https://${request.host}.example.test`,
        /^https:\/\/www\.example\.com\.example\.test$/,
      ],
    ];
    for (const [assetHost, expectedOrigin] of cases) {
      await withAssetHost(assetHost, async () => {
        await t.get(PAGE_PATH);
        while (t.response.isRedirect) await t.followRedirectBang();
        t.assertResponse(":success");

        const sources = scriptSrc();
        const page = HTML5.Document.parse(t.response.body);
        const baseUrl = t.request.baseUrl;
        // importmap-rails' `script[type=importmap]` imports and its hash are dropped:
        // Vite serves this app's JavaScript (CLAUDE.md, "importmap-rails and propshaft
        // are out of scope").
        const urls = [
          ...page.css("link[rel=modulepreload]").map((it) => it.get("href")!),
          ...page.css("script[src]").map((it) => it.get("src")!),
        ];
        const origins = [...new Set(urls.map((it) => new URL(it, baseUrl).origin))].filter(
          (origin) => origin !== baseUrl,
        );

        expect(origins, String(assetHost)).not.toEqual([]);
        for (const origin of origins) {
          expect(origin, String(assetHost)).toMatch(expectedOrigin);
          expect(sources, String(assetHost)).toContain(origin);
        }
      });
    }
  });

  it("with the policy turned off, pages send only frame-src", async () => {
    await (
      await fixture<Account>("accounts", "signal")
    ).updateBang({
      embed_providers: EmbedProvider.DEFAULTS,
    });

    await withoutPolicy(async () => {
      expect((await frameSrcTokens()).sort()).toEqual([...EmbedProvider.cspFrameSources()!].sort());
      expect(csp()).not.toMatch("script-src");
    });
  });

  it("with the policy turned off and no embeds, pages send none", async () => {
    await withoutPolicy(async () => {
      await t.get(PAGE_PATH);
      t.assertResponse(":success");
      expect(csp()).toBeUndefined();
    });
  });

  it("the escape hatch boots without a policy", () => {
    const output = execFileSync(
      "bin/trails",
      [
        "runner",
        "process.stdout.write(String(Trails.application.config.contentSecurityPolicy() ?? 'nil'))",
      ],
      {
        cwd: fileURLToPath(new URL("../..", import.meta.url)),
        env: { ...process.env, DISABLE_CONTENT_SECURITY_POLICY: "true" },
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8",
      },
    );

    expect(output).toBe("nil");
  }, 60_000);

  it("uploaded files are guarded on their way out", () => {
    const middleware = Trails.application.middleware as unknown as Iterable<{ klass: unknown }>;
    expect([...middleware].map((it) => it.klass)).toContain(
      constGet(TopLevel, "UploadedScriptGuard"),
    );
  });

  it("frame-src carries the account's configured providers", async () => {
    await (
      await fixture<Account>("accounts", "signal")
    ).updateBang({
      embed_providers: EmbedProvider.DEFAULTS,
    });

    expect((await frameSrcTokens()).sort()).toEqual([...EmbedProvider.cspFrameSources()!].sort());
  });

  it("an environment-configured table reaches the header without a restart, replacing the account's", async () => {
    await (
      await fixture<Account>("accounts", "signal")
    ).updateBang({
      embed_providers: EmbedProvider.DEFAULTS,
    });
    await setEmbedProviders(
      `[{"name":"Wistia","hosts":["fast.wistia.net"],"path_prefix":"/embed/"}]`,
    );

    expect(await frameSrcTokens()).toEqual(["https://fast.wistia.net"]);
  });

  it("a configured table with no valid entry fails closed", async () => {
    await setEmbedProviders(`[{"hosts":["*"],"path_prefix":"/e"}]`);

    expect(await frameSrcTokens()).toEqual(["'none'"]);
  });
});
