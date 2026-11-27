import { beforeEach, describe, expect, it } from "vitest";
import { fixture, loadFixtures } from "../../test-helper.ts";
import type { Book } from "../../../app/models/book.ts";
import { Leaf } from "../../../app/models/leaf.ts";
import type { Page } from "../../../app/models/page.ts";
import { Section } from "../../../app/models/section.ts";

const search = async (terms: unknown) => await Leaf.search(terms).toArray();
const ids = (leaves: Leaf[]) => leaves.map((leaf) => leaf.id);
const read = (leaf: Leaf, name: string) => leaf.readAttribute(name) as string;

describe("Leaf::SearchableTest", () => {
  const leaves = (label: string) => fixture<Leaf>("leaves", label);

  beforeEach(async () => {
    await loadFixtures();
    await Leaf.reindexAll();
  });

  it("leaf body is indexed and searchable", async () => {
    expect(ids(await search("great handbook"))).toContain((await leaves("welcome_page")).id);
  });

  it("updating a leaf updates the search index", async () => {
    const page = await fixture<Page>("pages", "welcome");
    await page.setAttributes({ body: "sausages" });
    await page.saveBang();

    expect(ids(await search("sausages"))).toContain((await leaves("welcome_page")).id);
  });

  it("search includes highlighted matches", async () => {
    const [first] = await search("great handbook");
    expect(read(first, "title_match")).toContain("The <mark>Handbook</mark>");
    expect(read(first, "content_match")).toContain("<mark>great</mark> <mark>handbook</mark>");
  });

  it("leaves with no searchable content are not indexed", async () => {
    expect(ids(await search("welcome"))).not.toContain((await leaves("welcome_section")).id);
  });

  it("matches_for_highlight returns the matching terms, longest first", async () => {
    expect(await (await leaves("welcome_page")).matchesForHighlight("great handbook")).toEqual([
      "handbook",
      "great",
    ]);
  });

  it("matches_for_highlight is empty when there is no match", async () => {
    expect(await (await leaves("welcome_page")).matchesForHighlight("haggis")).toEqual([]);
  });

  it("matches_for_highlight is empty when the query sanitizes to nothing", async () => {
    const leaf = await leaves("welcome_page");
    expect(await leaf.matchesForHighlight("^$")).toEqual([]);
    expect(await leaf.matchesForHighlight("🙂")).toEqual([]);
    expect(await leaf.matchesForHighlight('"')).toEqual([]);
  });

  it("search treats FTS5 operators as literal terms rather than syntax", async () => {
    expect(await search("OR")).toEqual([]);
    expect(await search("great AND NOT")).toEqual([]);
    expect(await search("great OR handbook")).toEqual([]);

    const welcome = (await leaves("welcome_page")).id;
    expect(ids(await search("great handbook"))).toContain(welcome);
    expect(ids(await search('"great handbook"'))).toContain(welcome);
  });

  it("a stray empty quote pair does not split a following phrase", async () => {
    await (
      await fixture<Section>("sections", "welcome")
    ).updateBang({ body: "great old handbook" });
    await (await leaves("welcome_section")).reindex();

    const results = ids(await search('"" "great handbook"'));

    expect(results).toContain((await leaves("welcome_page")).id);
    expect(results).not.toContain((await leaves("welcome_section")).id);
  });

  it("search does not raise on invalid UTF-8 byte sequences", async () => {
    const malformed = "caf\uDCFF";

    expect(await search(malformed)).toEqual([]);
    expect(await (await leaves("welcome_page")).matchesForHighlight(malformed)).toEqual([]);
  });

  it("indexing sanitizes section body", async () => {
    const section = new Section({ body: 'findme Tom & Jerry <img src=x onerror="alert(1)">' });
    await (await fixture<Book>("books", "handbook")).press(section, { title: "Safe Title" });
    await (await section.leaf)!.reindex();

    const [first] = await search("findme");
    expect(read(first, "content_match")).toBe("<mark>findme</mark> Tom &amp; Jerry ");
  });

  it("indexing sanitizes section title", async () => {
    const section = new Section({ body: "findme content" });
    await (
      await fixture<Book>("books", "handbook")
    ).press(section, {
      title: 'findme Tom & Jerry <img src=x onerror="alert(1)">',
    });
    await (await section.leaf)!.reindex();

    const [first] = await search("findme");
    expect(read(first, "title_match")).toBe("<mark>findme</mark> Tom &amp; Jerry ");
  });

  it("indexing sanitizes page body", async () => {
    const page = await fixture<Page>("pages", "welcome");
    await page.setAttributes({ body: "findme Tom & Jerry <b>bold</b>" });
    await page.saveBang();

    const [first] = await search("findme");
    expect(read(first, "content_match")).toBe("<mark>findme</mark> Tom &amp; Jerry bold");
  });

  it("indexing sanitizes page title", async () => {
    const leaf = await leaves("welcome_page");
    await leaf.updateBang({ title: "findme Tom & Jerry <b>bold</b>" });
    await leaf.reindex();

    const [first] = await search("findme");
    expect(read(first, "title_match")).toBe("<mark>findme</mark> Tom &amp; Jerry bold");
  });

  it("indexing strips injected mark tags from title", async () => {
    const section = new Section({ body: "findme content" });
    await (
      await fixture<Book>("books", "handbook")
    ).press(section, { title: "findme <mark>fake highlight</mark>" });
    await (await section.leaf)!.reindex();

    const [first] = await search("findme");
    expect(read(first, "title_match")).toBe("<mark>findme</mark> fake highlight");
  });
});
