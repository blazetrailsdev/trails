import { beforeEach, describe, expect, it } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { Notifications } from "@blazetrails/activesupport";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../test-helper.ts";
import { isolateEmbedProviders, setEmbedProviders } from "../embed-providers-env.ts";
import { Book } from "../../app/models/book.ts";
import { EmbedProvider } from "../../app/models/embed-provider.ts";
import type { Leaf } from "../../app/models/leaf.ts";
import type { Page } from "../../app/models/page.ts";
import type { User } from "../../app/models/user.ts";

const HOST = "http://www.example.com";
const bookSlugPath = (book: Book, format?: string) =>
  `/${book.id}/${book.slug}${format ? `.${format}` : ""}`;

describe("BooksControllerTest", () => {
  isolateEmbedProviders();

  let t: ApplicationIntegrationTest;
  const books = (label: string) => fixture<Book>("books", label);
  const users = (label: string) => fixture<User>("users", label);
  const leaves = (label: string) => fixture<Leaf>("leaves", label);
  const setBody = async (label: string, body: string) => {
    const page = (await (await leaves(label)).leafable) as Page;
    await page.setBody(body);
    await page.saveBang();
  };

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
    await t.signIn("kevin");
  });

  async function withFragmentCaching(block: () => Promise<void>): Promise<void> {
    const klass = ActionController.Base as unknown as {
      performCaching: boolean;
      cacheStore: unknown;
    };
    const [performCaching, cacheStore] = [klass.performCaching, klass.cacheStore];
    klass.performCaching = true;
    klass.cacheStore = ":memory_store";
    try {
      await block();
    } finally {
      klass.performCaching = performCaching;
      klass.cacheStore = cacheStore;
    }
  }

  it("index lists the current user's books", async () => {
    await t.get("/");

    t.assertResponse(":success");
    t.assertSelect("h2", { text: "Handbook" });
    t.assertSelect("h2", { text: "Manual", count: 0 });
  });

  it("index includes published books, even when the user does not have access", async () => {
    await (await books("manual")).updateBang({ published: true });

    await t.get("/");

    t.assertResponse(":success");
    t.assertSelect("h2", { text: "Handbook" });
    t.assertSelect("h2", { text: "Manual" });
  });

  it("index shows published books when not logged in", async () => {
    await (await books("manual")).updateBang({ published: true });

    await t.signOut();
    await t.get("/");

    t.assertResponse(":success");
    t.assertSelect("h2", { text: "Handbook", count: 0 });
    t.assertSelect("h2", { text: "Manual" });
  });

  it("index redirects to login if not signed in and no published books exist", async () => {
    await t.signOut();
    await t.get("/");

    t.assertRedirectedTo(`${HOST}/session/new`);
  });

  it("create makes the current user an editor", async () => {
    const before = (await Book.count()) as number;
    await t.post("/books", { params: { book: { title: "New Book", everyone_access: false } } });
    expect(await Book.count()).toBe(before + 1);

    const book = (await Book.last()) as Book;
    t.assertRedirectedTo(`${HOST}${bookSlugPath(book)}`);

    expect(book.title).toBe("New Book");
    expect(await book.accesses.count()).toBe(1);

    expect(await book.isEditable({ user: await users("kevin") })).toBe(true);
  });

  it("create sets additional accesses", async () => {
    await t.signIn("jason");
    const before = (await Book.count()) as number;
    await t.post("/books", {
      params: {
        book: { title: "New Book", everyone_access: false },
        "editor_ids[]": (await users("jz")).id,
        "reader_ids[]": (await users("kevin")).id,
      },
    });
    expect(await Book.count()).toBe(before + 1);

    const book = (await Book.last()) as Book;
    expect(book.title).toBe("New Book");
    expect(await book.accesses.count()).toBe(3);

    expect(await book.isEditable({ user: await users("jz") })).toBe(true);

    expect(await book.isAccessable({ user: await users("kevin") })).toBe(true);
    expect(await book.isEditable({ user: await users("kevin") })).toBe(false);
  });

  it("show only shows books the current user can access", async () => {
    await t.get(bookSlugPath(await books("manual")));
    t.assertResponse(":not_found");

    await t.get(bookSlugPath(await books("handbook")));
    t.assertResponse(":success");
  });

  it("show includes OG metadata for public access", async () => {
    const handbook = await books("handbook");
    await t.get(bookSlugPath(handbook));
    t.assertResponse(":success");

    t.assertSelect("meta[property='og:title'][content='Handbook']");
    t.assertSelect(`meta[property='og:url'][content='${HOST}${bookSlugPath(handbook)}']`);
  });

  it("show with markdown format returns combined markables", async () => {
    await setBody("welcome_page", "# Welcome Content");
    await setBody("summary_page", "# Summary Content");

    await t.get(bookSlugPath(await books("handbook"), "md"));

    t.assertResponse(":success");
    expect(t.response.body).toContain("# Welcome Content");
    expect(t.response.body).toContain("# Summary Content");
  });

  it("show with markdown format does not escape HTML", async () => {
    await setBody("welcome_page", "<div class='test'>HTML content</div>");

    await t.get(bookSlugPath(await books("handbook"), "md"));

    t.assertResponse(":success");
    expect(t.response.body).toContain("<div class='test'>");
    expect(t.response.body).not.toContain("&lt;");
  });

  it("show re-scrubs cached leaves when an allowlist is configured over permissive embeds", async () => {
    await withFragmentCaching(async () => {
      await setBody("welcome_page", `<iframe src="https://x.example/embed/1"></iframe>`);

      let writes = 0;
      await Notifications.subscribed(
        () => {
          writes += 1;
        },
        "write_fragment.action_controller",
        async () => {
          await t.get(bookSlugPath(await books("handbook")));
        },
      );
      t.assertResponse(":success");
      t.assertSelect("iframe[src=?]", "https://x.example/embed/1");
      expect(writes, "expected the page to be fragment cached").toBeGreaterThan(0);

      await setEmbedProviders(JSON.stringify(EmbedProvider.DEFAULTS));
      await t.get(bookSlugPath(await books("handbook")));
      t.assertResponse(":success");
      t.assertSelect("iframe", { count: 0 });
    });
  });

  it("show re-scrubs cached leaves when the allowlist narrows", async () => {
    await withFragmentCaching(async () => {
      await setBody("welcome_page", `<iframe src="https://x.example/embed/1"></iframe>`);

      await setEmbedProviders(`[{"hosts":["x.example"],"path_prefix":"/embed"}]`);
      await t.get(bookSlugPath(await books("handbook")));
      t.assertSelect("iframe[src=?]", "https://x.example/embed/1");

      await setEmbedProviders(JSON.stringify(EmbedProvider.DEFAULTS));
      await t.get(bookSlugPath(await books("handbook")));
      t.assertSelect("iframe", { count: 0 });
    });
  });

  it("show includes link to markdown format", async () => {
    const handbook = await books("handbook");
    await t.get(bookSlugPath(handbook));

    t.assertResponse(":success");
    t.assertSelect(
      `link[rel="alternate"][type="text/markdown"][href="${bookSlugPath(handbook, "md")}"]`,
    );
  });
});
