import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, fixture, leafablePath, loadFixtures } from "../test-helper.ts";
import { isolateEmbedProviders, setEmbedProviders } from "../embed-providers-env.ts";
import type { Book } from "../../app/models/book.ts";
import { EmbedProvider } from "../../app/models/embed-provider.ts";
import type { Leaf } from "../../app/models/leaf.ts";
import { Page } from "../../app/models/page.ts";

describe("PagesControllerTest", () => {
  isolateEmbedProviders();

  let t: ApplicationIntegrationTest;
  const books = (label: string) => fixture<Book>("books", label);
  const leaves = (label: string) => fixture<Leaf>("leaves", label);

  const samplePageLeaf = async (markdown: string) => {
    const page = new Page();
    await page.setBody(markdown);
    return await (await books("handbook")).press(page, { title: "Sample" });
  };

  const setWelcomeBody = async (body: string) => {
    const page = (await (await leaves("welcome_page")).page)!;
    await page.setBody(body);
    await page.saveBang();
  };

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
    await t.signIn("kevin");
  });

  it("show", async () => {
    await t.get(leafablePath(await samplePageLeaf("## Hello")));

    t.assertResponse(":ok");
    t.assertSelect("h2", { text: /Hello/ });
  });

  it("show sanitizes dangerous content", async () => {
    await t.get(
      leafablePath(await samplePageLeaf(`<div id="test"><script>alert("ouch")</script></div>`)),
    );

    t.assertSelect("#test", { html: `alert("ouch")` });
  });

  it("show with HTML content in the markdown", async () => {
    await t.get(
      leafablePath(
        await samplePageLeaf(`<div id="test"><div style="text-align:center;">Hello</div></div>`),
      ),
    );

    t.assertSelect("#test", { html: `<div style="text-align:center;">Hello</div>` });
  });

  it("show with iframes", async () => {
    await t.get(
      leafablePath(
        await samplePageLeaf(`<div id="test"><iframe src="http://example.com"></iframe></div>`),
      ),
    );

    t.assertSelect("#test", { html: `<iframe src="http://example.com"></iframe>` });
  });

  it("show keeps an approved-provider iframe under a configured allowlist", async () => {
    await setEmbedProviders(JSON.stringify(EmbedProvider.DEFAULTS));
    await setWelcomeBody(
      `<div id="test"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe></div>`,
    );

    await t.get(leafablePath(await leaves("welcome_page")));

    t.assertSelect("#test iframe[src=?]", "https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("show strips an off-allowlist iframe under a configured allowlist", async () => {
    await setEmbedProviders(JSON.stringify(EmbedProvider.DEFAULTS));
    await setWelcomeBody(`<div id="test"><iframe src="http://example.com"></iframe></div>`);

    await t.get(leafablePath(await leaves("welcome_page")));

    t.assertSelect("#test", { html: "" });
    t.assertSelect("#test iframe", { count: 0 });
  });

  it("show with tables in the markdown", async () => {
    await t.get(
      leafablePath(await samplePageLeaf(`| name | food |\n| ---- | ---- |\n| Kevin | Pizza |`)),
    );

    t.assertSelect("table th", { text: "name" });
    t.assertSelect("table th", { text: "food" });
    t.assertSelect("table td", { text: "Kevin" });
    t.assertSelect("table td", { text: "Pizza" });
  });

  it("create", async () => {
    const handbook = await books("handbook");
    await t.post(`/books/${handbook.id}/pages.turbo_stream`, {
      params: { leaf: { title: "Another page" }, page: { body: "With interesting words." } },
    });
    t.assertResponse(":success");

    const newPage = (await Page.last()) as Page;
    expect(await newPage.title()).toBe("Another page");
    expect(String((await newPage.body()).content)).toBe("With interesting words.");
    expect((await (await newPage.leaf)!.book).id).toBe(handbook.id);
  });

  it("create with default params", async () => {
    const handbook = await books("handbook");
    const before = (await Page.count()) as number;
    await t.post(`/books/${handbook.id}/pages.turbo_stream`);
    expect(await Page.count()).toBe(before + 1);
    t.assertResponse(":success");

    expect(await ((await Page.last()) as Page).title()).toBe("Untitled");
  });

  it("create at a specific position", async () => {
    const handbook = await books("handbook");
    const before = (await Page.count()) as number;
    await t.post(`/books/${handbook.id}/pages.turbo_stream`, { params: { position: 2 } });
    expect(await Page.count()).toBe(before + 1);
    t.assertResponse(":success");

    const leaf = (await ((await Page.last()) as Page).leaf)!;
    expect(await (await books("handbook")).leaves.before(leaf).count()).toBe(2);
  });

  it("update", async () => {
    const leaf = await leaves("welcome_page");
    await t.get(`${leafablePath(leaf)}/edit`);
    t.assertResponse(":ok");

    await t.put(leafablePath(leaf), {
      params: {
        leaf: { title: "Better welcome" },
        page: { body: "With even more interesting words." },
      },
    });
    t.assertResponse(":no_content");

    const updatedPage = (await Page.last()) as Page;
    expect(await updatedPage.title()).toBe("Better welcome");
    expect(String((await updatedPage.body()).content)).toBe("With even more interesting words.");
  });
});
