import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, resetDatabase } from "../test-helper.ts";
import { Book } from "../../app/models/book.ts";
import { Leaf } from "../../app/models/leaf.ts";

async function signedIn(name: string): Promise<ApplicationIntegrationTest> {
  const t = new ApplicationIntegrationTest(name);
  await t.firstRun();
  return t;
}

describe("BooksFlowTest", () => {
  beforeEach(resetDatabase);

  it("creates a book and shows it at its slugged URL", async () => {
    const t = await signedIn("create");
    await t.get("/books/new");
    expect(t.response.status).toBe(200);

    await t.post("/books", {
      params: { book: { title: "Field Notes", author: "Ada", theme: "green" } },
    });
    const book = (await Book.first()) as Book;
    expect(book.slug).toBe("field-notes");
    expect(t.response.location).toMatch(new RegExp(`/${book.id}/field-notes$`));

    await t.get(`/${book.id}/field-notes`);
    expect(t.response.status).toBe(200);
    expect(t.response.body).toContain("Field Notes");

    await t.get("/");
    expect(t.response.body).toContain("Field Notes");
  });

  it("adds pages and sections, renders markdown, and searches them", async () => {
    const t = await signedIn("pages");
    await t.post("/books", { params: { book: { title: "Manual" } } });
    const book = (await Book.first()) as Book;

    await t.post(`/books/${book.id}/sections`, {
      params: { leaf: { title: "Part one" } },
      headers: { Accept: "text/vnd.turbo-stream.html" },
    });
    expect(t.response.status).toBe(200);
    await t.post(`/books/${book.id}/pages`, {
      params: { leaf: { title: "Welcome" }, page: { body: "# Hello\n\nThe *quick* fox." } },
      headers: { Accept: "text/vnd.turbo-stream.html" },
    });
    expect(t.response.status).toBe(200);

    const leaves = await Leaf.order("position_score").toArray();
    expect(leaves.map((l) => l.title)).toEqual(["Part one", "Welcome"]);
    const page = leaves[1];

    await t.get(`/${book.id}/manual/${page.id}/welcome`);
    expect(t.response.status).toBe(200);
    expect(t.response.body).toContain("<em>quick</em>");
    expect(t.response.body).toContain(
      '<h1 id="hello">Hello <a href="#hello" class="heading__link"',
    );

    await t.get(`/books/${book.id}/pages/${page.id}/edit`);
    expect(t.response.status).toBe(200);
    expect(t.response.body).toContain('<house-md name="page[body]"');
    expect(t.response.body).toContain('data-house-md-action="bold"');

    await t.post(`/books/${book.id}/search`, { params: { search: "fox" } });
    expect(t.response.status).toBe(200);
    expect(t.response.body).toContain("<mark>fox</mark>");
  });

  it("moves a leaf and trashes it", async () => {
    const t = await signedIn("move");
    await t.post("/books", { params: { book: { title: "Order" } } });
    const book = (await Book.first()) as Book;
    for (const title of ["A", "B", "C"]) {
      await t.post(`/books/${book.id}/sections`, {
        params: { leaf: { title } },
        headers: { Accept: "text/vnd.turbo-stream.html" },
      });
    }
    const [a, , c] = await Leaf.order("position_score").toArray();

    await t.post(`/books/${book.id}/leaves/moves`, { params: { id: c.id, position: 0 } });
    expect(t.response.status).toBe(204);
    expect((await Leaf.order("position_score").toArray()).map((l) => l.title)).toEqual([
      "C",
      "A",
      "B",
    ]);

    await t.delete(`/books/${book.id}/sections/${a.id}`);
    expect(t.response.status).toBe(302);
    await a.reload();
    expect(a.status).toBe("trashed");
  });

  it("publishes a book so signed-out readers can open it", async () => {
    const t = await signedIn("publish");
    await t.post("/books", { params: { book: { title: "Public" } } });
    const book = (await Book.first()) as Book;
    await t.patch(`/books/${book.id}/publication`, { params: { book: { published: "1" } } });
    expect((await Book.find(book.id)).published).toBe(true);

    const reader = new ApplicationIntegrationTest("reader");
    await reader.get(`/${book.id}/public`);
    expect(reader.response.status).toBe(200);
    expect(reader.response.body).toContain("Public");
  });
});
