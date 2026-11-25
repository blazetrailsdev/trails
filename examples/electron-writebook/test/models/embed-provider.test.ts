import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Trails } from "@blazetrails/trailties";
import { fixture, loadFixtures } from "../test-helper.ts";
import { Account } from "../../app/models/account.ts";
import { EmbedProvider } from "../../app/models/embed-provider.ts";

describe("EmbedProviderTest", () => {
  const accounts = (label: string) => fixture<Account>("accounts", label);
  const setEnv = async (value: string) => {
    process.env.WRITEBOOK_EMBED_PROVIDERS = value;
    await EmbedProvider.resolution();
  };
  const deleteEnv = async () => {
    delete process.env.WRITEBOOK_EMBED_PROVIDERS;
    await EmbedProvider.resolution();
  };
  const setAccount = async (embedProviders: unknown) => {
    await (await accounts("signal")).updateBang({ embed_providers: embedProviders });
    await EmbedProvider.resolution();
  };
  let embedProvidersBefore: string | undefined;

  beforeEach(async () => {
    embedProvidersBefore = process.env.WRITEBOOK_EMBED_PROVIDERS;
    delete process.env.WRITEBOOK_EMBED_PROVIDERS;
    await loadFixtures();
    await setAccount(EmbedProvider.DEFAULTS);
  });

  afterEach(() => {
    if (embedProvidersBefore == null) delete process.env.WRITEBOOK_EMBED_PROVIDERS;
    else process.env.WRITEBOOK_EMBED_PROVIDERS = embedProvidersBefore;
  });

  it("permissive when neither the environment nor the account configures a table", async () => {
    await setAccount(null);

    expect(EmbedProvider.isConfigured()).toBe(false);
    expect(EmbedProvider.all()).toEqual([]);
    expect(EmbedProvider.cspFrameSources()).toBeUndefined();
    expect(EmbedProvider.cacheVersion()).toBe("permissive");
  });

  it("permissive on an install with no account row at all", async () => {
    await Account.deleteAll();
    await EmbedProvider.resolution();

    expect(EmbedProvider.isConfigured()).toBe(false);
    expect(EmbedProvider.cspFrameSources()).toBeUndefined();
  });

  it("the account setting configures the allowlist", () => {
    expect(EmbedProvider.isConfigured()).toBe(true);
    expect(EmbedProvider.isAllows("https://www.youtube.com/embed/abc")).toBe(true);
    expect(EmbedProvider.isAllows("https://evil.com/embed/abc")).toBe(false);
  });

  it("the environment configures the allowlist on an install with no setting", async () => {
    await setAccount(null);
    await setEnv(`[{"name":"Wistia","hosts":["fast.wistia.net"],"path_prefix":"/embed/"}]`);

    expect(EmbedProvider.isConfigured()).toBe(true);
    expect(EmbedProvider.isAllows("https://fast.wistia.net/embed/iframe/abc")).toBe(true);
    expect(EmbedProvider.cspFrameSources()).toEqual(["https://fast.wistia.net"]);
  });

  it("the environment replaces the account setting rather than extending it", async () => {
    await setEnv(`[{"name":"Wistia","hosts":["fast.wistia.net"],"path_prefix":"/embed/"}]`);

    expect(EmbedProvider.isAllows("https://fast.wistia.net/embed/iframe/abc")).toBe(true);
    expect(EmbedProvider.isAllows("https://www.youtube.com/embed/abc")).toBe(false);
    expect(EmbedProvider.cspFrameSources()).toEqual(["https://fast.wistia.net"]);
  });

  it("the curated defaults are config entries, so they round-trip through the environment", async () => {
    await setAccount(null);
    await setEnv(JSON.stringify(EmbedProvider.DEFAULTS));

    expect(EmbedProvider.isAllows("https://www.youtube.com/embed/abc")).toBe(true);
    expect(EmbedProvider.cspFrameSources()).toEqual(
      EmbedProvider.DEFAULTS.flatMap((entry) =>
        (entry.hosts as string[]).map((host) => `https://${host}`),
      ),
    );
  });

  for (const [name, url] of Object.entries({
    YouTube: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "YouTube (nocookie)": "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    Vimeo: "https://player.vimeo.com/video/76979871",
    Loom: "https://www.loom.com/embed/0123456789abcdef",
    "Google Maps": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3",
  })) {
    it(`${name} embed is allowed`, () => {
      expect(EmbedProvider.isAllows(url), `expected ${url} to be allowed`).toBe(true);
    });
  }

  it("bare and www hosts both allowed", () => {
    expect(EmbedProvider.isAllows("https://youtube.com/embed/abc")).toBe(true);
    expect(EmbedProvider.isAllows("https://www.youtube.com/embed/abc")).toBe(true);
  });

  it("unknown origin is rejected", () => {
    expect(EmbedProvider.isAllows("https://evil.com/embed/abc")).toBe(false);
  });

  it("valid host with wrong path shape is rejected", () => {
    expect(EmbedProvider.isAllows("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    expect(EmbedProvider.isAllows("https://player.vimeo.com/channels/staffpicks")).toBe(false);
    expect(EmbedProvider.isAllows("https://www.google.com/maps/place/foo")).toBe(false);
  });

  it("path-prefix boundary tricks are rejected", () => {
    expect(EmbedProvider.isAllows("https://www.youtube.com/embedxyz/evil")).toBe(false);
    expect(EmbedProvider.isAllows("https://www.youtube.com/embedded")).toBe(false);
  });

  it("dot-segment and encoded traversal past the prefix are rejected", () => {
    expect(EmbedProvider.isAllows("https://www.youtube.com/embed/../watch?v=x")).toBe(false);
    expect(EmbedProvider.isAllows("https://www.youtube.com/embed/%2e%2e/watch")).toBe(false);
    expect(EmbedProvider.isAllows("https://www.youtube.com/embed%2fx")).toBe(false);
  });

  it("explicit non-default port is rejected (CSP is host-only, implicit 443)", () => {
    expect(EmbedProvider.isAllows("https://www.youtube.com:444/embed/x")).toBe(false);
    expect(EmbedProvider.isAllows("https://www.youtube.com:443/embed/x")).toBe(true);
  });

  it("protocol-relative url is rejected", () => {
    expect(EmbedProvider.isAllows("//www.youtube.com/embed/abc")).toBe(false);
  });

  it("non-https schemes are rejected", () => {
    expect(EmbedProvider.isAllows("http://www.youtube.com/embed/abc")).toBe(false);
    expect(EmbedProvider.isAllows("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(EmbedProvider.isAllows("javascript:alert(1)")).toBe(false);
  });

  it("userinfo host confusion is rejected", () => {
    expect(EmbedProvider.isAllows("https://www.youtube.com@evil.com/embed/abc")).toBe(false);
    expect(EmbedProvider.isAllows("https://evil.com@www.youtube.com/embed/abc")).toBe(false);
  });

  it("lookalike hostnames are rejected", () => {
    expect(EmbedProvider.isAllows("https://notyoutube.com/embed/abc")).toBe(false);
    expect(EmbedProvider.isAllows("https://youtube.com.evil.com/embed/abc")).toBe(false);
  });

  it("host is matched case-insensitively", () => {
    expect(EmbedProvider.isAllows("https://WWW.YOUTUBE.COM/embed/abc")).toBe(true);
  });

  it("trailing-dot host is rejected (CSP would not match it)", () => {
    expect(EmbedProvider.isAllows("https://www.youtube.com./embed/abc")).toBe(false);
  });

  it("blank and malformed srcs are rejected", () => {
    expect(EmbedProvider.isAllows(null)).toBe(false);
    expect(EmbedProvider.isAllows("")).toBe(false);
    expect(EmbedProvider.isAllows("https://")).toBe(false);
  });

  it("csp_frame_sources reflects exactly the configured table", () => {
    expect(EmbedProvider.cspFrameSources()).toEqual([
      "https://youtube.com",
      "https://www.youtube.com",
      "https://youtube-nocookie.com",
      "https://www.youtube-nocookie.com",
      "https://player.vimeo.com",
      "https://loom.com",
      "https://www.loom.com",
      "https://google.com",
      "https://www.google.com",
    ]);
  });

  it("default providers carry only the vetted attribute set", () => {
    const provider = EmbedProvider.match("https://www.youtube.com/embed/abc")!;
    expect(provider.attributes).toEqual(EmbedProvider.PERMITTED_ATTRIBUTES);
    for (const forbidden of [
      "srcdoc",
      "sandbox",
      "name",
      "onload",
      "style",
      "allow",
      "referrerpolicy",
    ]) {
      expect(provider.attributes).not.toContain(forbidden);
    }
  });

  it("config cannot reintroduce forbidden attributes", async () => {
    await setEnv(
      `[{"name":"X","hosts":["x.example"],"path_prefix":"/e","attributes":["src","srcdoc","sandbox","onload","style","allow","referrerpolicy"]}]`,
    );

    const provider = EmbedProvider.match("https://x.example/e/1")!;
    expect(provider.attributes).toEqual(["src"]);
  });

  it("invalid environment json is ignored, the account setting still applies", async () => {
    await setEnv("{not valid json");
    expect(EmbedProvider.isAllows("https://www.youtube.com/embed/abc")).toBe(true);
    expect(EmbedProvider.isAllows("https://x.example/e/1")).toBe(false);
  });

  it("a rejected entry or unparsable value is logged once per distinct configuration, not per call", async () => {
    const warn = vi.spyOn(Trails.logger!, "warn");
    try {
      const capture = async (block: () => void) => {
        warn.mockClear();
        await EmbedProvider.resolution();
        block();
        await EmbedProvider.resolution();
        return warn.mock.calls.map((args) => String(args[0])).join("\n");
      };

      process.env.WRITEBOOK_EMBED_PROVIDERS = `[{"name":"typo-${Math.random()}","hosts":["*"],"path_prefix":"/e"}]`;
      let log = await capture(() => {
        for (let i = 0; i < 3; i++) EmbedProvider.all();
        for (let i = 0; i < 3; i++) EmbedProvider.cspFrameSources();
      });
      expect(log.split("ignoring invalid provider entry").length - 1, log).toBe(1);

      process.env.WRITEBOOK_EMBED_PROVIDERS = `{not valid json ${Math.random()}`;
      log = await capture(() => {
        for (let i = 0; i < 3; i++) EmbedProvider.isConfigured();
        for (let i = 0; i < 3; i++) EmbedProvider.all();
      });
      expect(log.split("not valid JSON").length - 1, log).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("a changed configuration is picked up without a restart", async () => {
    await setEnv(`[{"hosts":["a.example"],"path_prefix":"/a"}]`);
    expect(EmbedProvider.isAllows("https://a.example/a/1")).toBe(true);

    await setEnv(`[{"hosts":["b.example"],"path_prefix":"/b"}]`);
    expect(EmbedProvider.isAllows("https://a.example/a/1")).toBe(false);
    expect(EmbedProvider.isAllows("https://b.example/b/1")).toBe(true);

    await deleteEnv();
    await setAccount([{ hosts: ["c.example"], path_prefix: "/c" }]);
    expect(EmbedProvider.isAllows("https://c.example/c/1")).toBe(true);
    expect(EmbedProvider.isAllows("https://b.example/b/1")).toBe(false);
  });

  it("a single provider object (not wrapped in an array) is accepted", async () => {
    await setEnv(`{"name":"Wistia","hosts":["fast.wistia.net"],"path_prefix":"/embed/"}`);
    expect(EmbedProvider.isAllows("https://fast.wistia.net/embed/iframe/abc")).toBe(true);
    expect(EmbedProvider.cspFrameSources()).toContain("https://fast.wistia.net");
  });

  it("root-equivalent path prefixes are rejected and the table fails closed", async () => {
    for (const prefix of [
      "/",
      "/.",
      "/./",
      "//",
      "/embed/..",
      "/embed/../",
      "/embed/./..",
      "embed",
    ]) {
      await setEnv(`[{"name":"x","hosts":["x.example"],"path_prefix":"${prefix}"}]`);

      expect(EmbedProvider.isConfigured(), prefix).toBe(true);
      expect(EmbedProvider.cspFrameSources(), prefix).toEqual(["'none'"]);
      expect(EmbedProvider.isAllows("https://x.example/anything"), prefix).toBe(false);
      expect(EmbedProvider.isAllows("https://x.example/./anything"), prefix).toBe(false);
      expect(EmbedProvider.isAllows("https://x.example//anything"), prefix).toBe(false);
    }
  });

  it("a configured path prefix is stored in canonical form", async () => {
    await setEnv(`[{"name":"x","hosts":["x.example"],"path_prefix":"/embed//x/"}]`);

    const provider = EmbedProvider.match("https://x.example/embed/x/1")!;
    expect(provider.pathPrefix).toBe("/embed/x");
    expect(EmbedProvider.isAllows("https://x.example/embed/xy")).toBe(false);
    expect(EmbedProvider.isAllows("https://x.example/embed/../x/1")).toBe(false);
  });

  it("wildcard, whitespace and over-broad config entries are rejected and the table fails closed", async () => {
    for (const config of [
      `[{"name":"a","hosts":["*"],"path_prefix":"/e"}]`,
      `[{"name":"b","hosts":["*.example.com"],"path_prefix":"/e"}]`,
      `[{"name":"c","hosts":["x.example bad"],"path_prefix":"/e"}]`,
      `[{"name":"d","hosts":["x.example"],"path_prefix":"/"}]`,
      `[{"name":"e","hosts":["127.1"],"path_prefix":"/e"}]`,
      `[{"name":"f","hosts":["0x7f.1"],"path_prefix":"/e"}]`,
    ]) {
      await setEnv(config);
      expect(EmbedProvider.cspFrameSources(), config).toEqual(["'none'"]);
      expect(EmbedProvider.isAllows("https://x.example/anything"), config).toBe(false);
    }
  });

  it("cache_version distinguishes permissive from configured and follows the table", async () => {
    const configured = EmbedProvider.cacheVersion();
    expect(EmbedProvider.cacheVersion()).toBe(configured);

    await setAccount(null);
    expect(EmbedProvider.cacheVersion()).toBe("permissive");

    await setEnv(`[{"name":"x","hosts":["x.example"],"path_prefix":"/e"}]`);
    const withHost = EmbedProvider.cacheVersion();
    expect(withHost).not.toBe(configured);

    await setEnv(`[{"name":"x","hosts":["x.example"],"path_prefix":"/e","attributes":["src"]}]`);
    expect(EmbedProvider.cacheVersion()).not.toBe(withHost);

    await setEnv(`[{"name":"x","hosts":["x.example"],"path_prefix":"/f"}]`);
    expect(EmbedProvider.cacheVersion()).not.toBe(withHost);
  });

  it("cache_version follows resolution order, since match is first-match-wins", async () => {
    await setEnv(
      `[{"hosts":["x.example"],"path_prefix":"/e","attributes":["src"]},{"hosts":["x.example"],"path_prefix":"/e"}]`,
    );
    const narrowFirst = EmbedProvider.cacheVersion();
    expect(EmbedProvider.match("https://x.example/e/1")!.attributes).toEqual(["src"]);

    await setEnv(
      `[{"hosts":["x.example"],"path_prefix":"/e"},{"hosts":["x.example"],"path_prefix":"/e","attributes":["src"]}]`,
    );
    expect(EmbedProvider.cacheVersion()).not.toBe(narrowFirst);
    expect(EmbedProvider.match("https://x.example/e/1")!.attributes).toEqual(
      EmbedProvider.PERMITTED_ATTRIBUTES,
    );
  });
});
