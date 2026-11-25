import { beforeEach, describe, expect, it } from "vitest";
import { StringIO } from "@blazetrails/ruby-compat";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../test-helper.ts";
import type { Book } from "../../app/models/book.ts";
import { Leaf } from "../../app/models/leaf.ts";
import type { Section } from "../../app/models/section.ts";
import type { User } from "../../app/models/user.ts";

// Writebook's test/fixtures/files/pixel.bmp, a 1x1 bitmap, kept inline because the
// control-byte check refuses a raw .bmp outside its binary allowlist.
const PIXEL_BMP = Buffer.from(
  "Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAA/wAAAA==",
  "base64",
);

describe("LeafablesControllerTest", () => {
  let t: ApplicationIntegrationTest;
  const books = (label: string) => fixture<Book>("books", label);
  const leaves = (label: string) => fixture<Leaf>("leaves", label);
  const leafableSlugPath = async (leaf: Leaf, format?: string) => {
    const book = await leaf.book;
    return `/${book.id}/${book.slug}/${leaf.id}/${leaf.slug()}${format ? `.${format}` : ""}`;
  };
  const leavesCount = async () => (await (await books("handbook")).leaves.count()) as number;
  const publishHandbook = async () => (await books("handbook")).updateBang({ published: true });

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
    await t.signIn("kevin");
  });

  it("show", async () => {
    await t.get(await leafableSlugPath(await leaves("welcome_page")));

    t.assertResponse(":success");
    t.assertSelect("p", "This is such a great handbook.");
  });

  it("show with public access to a published book", async () => {
    await t.signOut();
    await publishHandbook();

    await t.get(await leafableSlugPath(await leaves("welcome_page")));

    t.assertResponse(":success");
    t.assertSelect("p", "This is such a great handbook.");
  });

  it("show highlights search terms", async () => {
    await Leaf.reindexAll();
    await t.get(await leafableSlugPath(await leaves("welcome_page")), {
      params: { search: "great" },
    });

    t.assertResponse(":success");
    t.assertSelect("mark", "great");
  });

  it("show does not raise when the search query sanitizes to empty", async () => {
    await t.signOut();
    await publishHandbook();
    await Leaf.reindexAll();

    for (const query of ["^$", "!!!", "🙂", '"']) {
      await t.get(await leafableSlugPath(await leaves("welcome_page")), {
        params: { search: query },
      });

      expect(t.response.status, `expected ${JSON.stringify(query)} to render without error`).toBe(
        200,
      );
      expect(t.response.body).toContain("a great handbook.");
    }
  });

  it("show does not raise when the search query uses FTS5 operator syntax", async () => {
    await t.signOut();
    await publishHandbook();
    await Leaf.reindexAll();

    for (const query of ["OR", "AND", "NOT", "great OR", "NEAR handbook", "great AND NOT"]) {
      await t.get(await leafableSlugPath(await leaves("welcome_page")), {
        params: { search: query },
      });

      expect(t.response.status, `expected ${JSON.stringify(query)} to render without error`).toBe(
        200,
      );
    }
  });

  it("show does not raise when a phrase match spans regex metacharacters", async () => {
    await t.signOut();
    await publishHandbook();

    await (
      await fixture<Section>("sections", "welcome")
    ).updateBang({
      body: "alpha(beta gamma in the body",
    });
    await (await leaves("welcome_section")).reindex();

    await t.get(await leafableSlugPath(await leaves("welcome_section")), {
      params: { search: "alpha_beta" },
    });

    t.assertResponse(":success");
    t.assertSelect("mark", { text: /alpha\(beta/ });
  });

  it("show does not allow public access to an unpublished book", async () => {
    await t.signOut();

    await t.get(await leafableSlugPath(await leaves("welcome_page")));

    t.assertResponse(":not_found");
  });

  it("show includes link to markdown format", async () => {
    const leaf = await leaves("welcome_page");
    await t.get(await leafableSlugPath(leaf));

    t.assertResponse(":success");
    t.assertSelect(
      `link[rel="alternate"][type="text/markdown"][href="${await leafableSlugPath(leaf, "md")}"]`,
    );
  });

  it("show with markdown format returns raw markdown content", async () => {
    const page = (await (await leaves("welcome_page")).page)!;
    await page.setBody("## Hello\n\nThis is **bold** text.");
    await page.saveBang();

    await t.get(await leafableSlugPath(await leaves("welcome_page"), "md"));

    t.assertResponse(":success");
    expect(t.response.body).toContain("## Hello");
    expect(t.response.body).toContain("This is **bold** text.");
    expect(t.response.body).toContain('title: "Welcome to The Handbook!"');
  });

  it("show with markdown format for section returns body", async () => {
    await (await (
      await leaves("welcome_section")
    ).section)!.updateBang({
      body: "Section Body Content",
    });

    await t.get(await leafableSlugPath(await leaves("welcome_section"), "md"));

    t.assertResponse(":success");
    expect(t.response.body).toContain("Section Body Content");
    expect(t.response.body).toContain('title: "The Welcome Section"');
  });

  it("show with markdown format for picture returns caption", async () => {
    await (await (
      await leaves("reading_picture")
    ).picture)!.updateBang({
      caption: "A beautiful picture",
    });

    await t.get(await leafableSlugPath(await leaves("reading_picture"), "md"));

    t.assertResponse(":success");
    expect(t.response.body).toContain("A beautiful picture");
    expect(t.response.body).toContain('title: "Reading"');
  });

  it("show a picture whose image cannot be resized", async () => {
    await (await (
      await leaves("reading_picture")
    ).picture)!.image.attach({
      io: new StringIO(PIXEL_BMP),
      filename: "pixel.bmp",
      content_type: "image/bmp",
    });

    await t.get(await leafableSlugPath(await leaves("reading_picture")));

    t.assertResponse(":success");
    t.assertSelect('figure img[src*="pixel.bmp"]');
  });

  it("show with markdown format does not escape HTML entities", async () => {
    const page = (await (await leaves("welcome_page")).page)!;
    await page.setBody("This has <a href='http://example.com'>a link</a>");
    await page.saveBang();

    await t.get(await leafableSlugPath(await leaves("welcome_page"), "md"));

    t.assertResponse(":success");
    expect(t.response.body).toContain("<a href='http://example.com'>");
    expect(t.response.body).not.toContain("&lt;");
  });

  it("create", async () => {
    const handbook = await books("handbook");
    const before = await leavesCount();
    await t.post(`/books/${handbook.id}/pages.turbo_stream`, {
      params: { leaf: { title: "Another page" }, page: { body: "With interesting words." } },
    });
    expect(await leavesCount()).toBe(before + 1);

    t.assertResponse(":success");
  });

  it("create requires editor access", async () => {
    const handbook = await books("handbook");
    await (await handbook.accessFor({ user: await fixture<User>("users", "kevin") }))!.updateBang({
      level: "reader",
    });

    const before = await leavesCount();
    await t.post(`/books/${handbook.id}/pages.turbo_stream`, {
      params: { leaf: { title: "Another page" }, page: { body: "With interesting words." } },
    });
    expect(await leavesCount()).toBe(before);

    t.assertResponse(":forbidden");
  });
});
