import { beforeEach, describe, expect, it } from "vitest";
import type { XmlNode as Node } from "@blazetrails/nokogiri";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../../test-helper.ts";
import type { Book } from "../../../app/models/book.ts";
import { Leaf } from "../../../app/models/leaf.ts";
import type { Page } from "../../../app/models/page.ts";
import { Section } from "../../../app/models/section.ts";

interface Element {
  name: string;
  content: string;
  attributes: unknown[];
  elements: Element[];
}

/**
 * The shape Writebook's `assert_pattern { result => { elements: [...] } }` matches
 * against. Ruby pattern matching has no port (CLAUDE.md, "Ruby pattern matching has
 * no port"), so each pattern is the same facts as a `toMatchObject` expectation:
 * an array pattern matches its length exactly and a hash pattern matches partially,
 * as `toMatchObject` does.
 */
function shape(node: Node): Element {
  return {
    name: node.name,
    content: node.content,
    attributes: node.attributeNodes,
    elements: node.elementChildren.map((child: Node) => shape(child)),
  };
}

describe("Books::SearchesControllerTest", () => {
  let t: ApplicationIntegrationTest;
  const books = (label: string) => fixture<Book>("books", label);
  const leaves = (label: string) => fixture<Leaf>("leaves", label);
  const searchPath = async () => `/books/${(await books("handbook")).id}/search`;
  const search = async (query: string) => t.post(await searchPath(), { params: { search: query } });
  const pressSection = async (body: string, title: string) => {
    const section = new Section({ body });
    await (await books("handbook")).press(section, { title });
    return section;
  };
  const results = () =>
    t
      .cssSelect("a.search__result")
      .toA()
      .map((node) => shape(node as Node));

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
    await t.signIn("kevin");

    await Leaf.reindexAll();
  });

  it("create finds matching pages", async () => {
    await search("Thanks");

    t.assertResponse(":success");
    t.assertSelect("a", { text: /Thanks for reading/i });
  });

  it("create allows searching published books without being logged in", async () => {
    await t.signOut();
    await (await books("handbook")).updateBang({ published: true });

    await search("Thanks");
    t.assertResponse(":success");

    await (await books("handbook")).updateBang({ published: false });

    await search("Thanks");
    t.assertResponse(":not_found");
  });

  it("create shows when there are no matches", async () => {
    await search("the invisible man");

    t.assertResponse(":success");
    t.assertSelect("p", { text: /no matches/i });
  });

  it("create shows no matches when the search has only ignored characters", async () => {
    await search("^$");

    t.assertResponse(":success");
    t.assertSelect("p", { text: /no matches/i });
  });

  it("create shows no matches when the search uses FTS5 operator syntax", async () => {
    for (const query of ["OR", "AND", "NOT", "great OR", "NEAR handbook", "great AND NOT"]) {
      await search(query);

      expect(t.response.status, `expected ${JSON.stringify(query)} to render without error`).toBe(
        200,
      );
    }
  });

  it("create still finds matches for an ordinary multi-word query", async () => {
    await search("great handbook");

    t.assertResponse(":success");
    t.assertSelect("a.search__result");
  });

  it("create does not find trashed pages", async () => {
    await (await leaves("summary_page")).trashedBang();

    await search("Thanks");

    t.assertResponse(":success");
    t.assertSelect("p", { text: /no matches/i });
  });

  it("search results strip dangerous tags from section body", async () => {
    const section = await pressSection(`findme <img src=x onerror="alert(1)">`, "Safe Title");
    await (await section.leaf)!.reindex();

    await search("findme");

    t.assertResponse(":success");
    t.assertSelect("a.search__result", { count: 2 });
    for (const result of results()) {
      expect(result).toMatchObject({
        elements: [
          { name: "strong", content: "Safe Title:" },
          { name: "mark", content: "findme" },
        ],
      });
    }
  });

  it("search results strip dangerous tags from section title", async () => {
    const section = await pressSection("findme content", `findme <img src=x onerror="alert(1)">`);
    await (await section.leaf)!.reindex();

    await search("findme");

    t.assertResponse(":success");
    t.assertSelect("a.search__result", { count: 2 });
    for (const result of results()) {
      expect(result).toMatchObject({
        elements: [
          { name: "strong", elements: [{ name: "mark", content: "findme" }] },
          { name: "mark", content: "findme" },
        ],
      });
    }
  });

  it("search results strip dangerous tags from page body", async () => {
    const page = await fixture<Page>("pages", "welcome");
    await page.setBody("findme <b>bold</b>");
    await page.saveBang();
    await (await leaves("welcome_page")).reindex();

    await search("findme");

    t.assertResponse(":success");
    t.assertSelect("a.search__result", { count: 2 });
    for (const result of results()) {
      expect(result).toMatchObject({
        elements: [
          { name: "strong", content: expect.stringMatching(/Handbook/) },
          { name: "mark", content: "findme" },
        ],
      });
    }
  });

  it("search results strip dangerous tags from page title", async () => {
    const leaf = await leaves("welcome_page");
    await leaf.updateBang({ title: "findme <b>bold</b>" });
    await leaf.reindex();

    await search("findme");

    t.assertResponse(":success");
    t.assertSelect("a.search__result", { count: 2 });
    for (const result of results()) {
      expect(result).toMatchObject({
        elements: [
          {
            name: "strong",
            elements: [{ name: "mark", content: "findme" }],
            content: "findme bold:",
          },
        ],
      });
    }
  });

  it("search results encode entities in section body", async () => {
    const section = await pressSection("findme Tom & Jerry", "Safe Title");
    await (await section.leaf)!.reindex();

    await search("findme");

    t.assertResponse(":success");
    expect(t.response.body).toContain("Tom &amp; Jerry");
  });

  it("search results encode entities in section title", async () => {
    const section = await pressSection("findme content", "findme Tom & Jerry");
    await (await section.leaf)!.reindex();

    await search("findme");

    t.assertResponse(":success");
    expect(t.response.body).toContain("Tom &amp; Jerry");
  });

  it("search results encode entities in page body", async () => {
    const page = await fixture<Page>("pages", "welcome");
    await page.setBody("findme Tom & Jerry");
    await page.saveBang();
    await (await leaves("welcome_page")).reindex();

    await search("findme");

    t.assertResponse(":success");
    expect(t.response.body).toContain("Tom &amp; Jerry");
  });

  it("search results encode entities in page title", async () => {
    const leaf = await leaves("welcome_page");
    await leaf.updateBang({ title: "findme Tom & Jerry" });
    await leaf.reindex();

    await search("findme");

    t.assertResponse(":success");
    expect(t.response.body).toContain("Tom &amp; Jerry");
  });

  it("search results sanitize pre-existing poisoned body in the index", async () => {
    const section = await pressSection("findme safe content", "Safe Title");

    await (
      await Leaf.leaseConnection()
    ).execute(
      Leaf.sanitizeSql([
        "update leaf_search_index set content = ? where rowid = ?",
        `findme <img src=x onerror="alert(1)"> Tom & Jerry`,
        (await section.leaf)!.id,
      ]),
    );

    await search("findme");

    t.assertResponse(":success");
    t.assertSelect("a.search__result", { count: 2 });
    for (const result of results()) {
      expect(result).toMatchObject({
        elements: [
          { name: "strong", content: "Safe Title:" },
          { name: "mark", content: "findme" },
        ],
      });
    }
    expect(t.response.body).toContain("Tom &amp; Jerry");
  });

  it("search results sanitize pre-existing poisoned title in the index", async () => {
    const section = await pressSection("findme safe content", "Safe Title");

    await (
      await Leaf.leaseConnection()
    ).execute(
      Leaf.sanitizeSql([
        "update leaf_search_index set title = ? where rowid = ?",
        `findme <mark onclick="alert(1)">fake</mark> <img src=x onerror="alert(1)">`,
        (await section.leaf)!.id,
      ]),
    );

    await search("findme");

    t.assertResponse(":success");
    t.assertSelect("a.search__result", { count: 2 });
    for (const result of results()) {
      expect(result).toMatchObject({
        elements: [
          {
            name: "strong",
            elements: [
              { name: "mark", content: "findme", attributes: [] },
              { name: "mark", content: "fake", attributes: [] },
            ],
          },
          { name: "mark", content: "findme" },
        ],
      });
    }
  });
});
