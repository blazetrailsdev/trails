import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, fakeDesktop, resetDatabase } from "../test-helper.ts";
import { Bookmark } from "../../app/models/bookmark.ts";
import { Attachment } from "../../app/models/attachment.ts";

describe("BookmarksFlowTest", () => {
  beforeEach(resetDatabase);

  it("creates a tagged bookmark and lists it, filtered by tag and read state", async () => {
    const t = new ApplicationIntegrationTest("create");
    await t.post("/bookmarks", {
      params: {
        bookmark: { title: "Turbo handbook", url: "https://turbo.hotwired.dev" },
        tag_list: "hotwire",
      },
    });
    expect(t.response.status).toBe(302);
    const bookmark = (await Bookmark.first()) as Bookmark;
    expect(await bookmark.tagNames()).toEqual(["hotwire"]);

    await t.get("/bookmarks?tag=hotwire");
    expect(t.response.body).toContain("Turbo handbook");
    await t.patch(`/bookmarks/${bookmark.id}/toggleRead`);
    await t.get("/bookmarks?filter=unread");
    expect(t.response.body).not.toContain("Turbo handbook");
  });

  it("re-renders the form on invalid input", async () => {
    const t = new ApplicationIntegrationTest("invalid");
    await t.post("/bookmarks", { params: { bookmark: { title: "x", url: "nope" } } });
    expect(t.response.status).toBe(422);
    expect(t.response.body).toContain("must start with http:// or https://");
  });

  it("says native actions need the desktop app when no shell is installed", async () => {
    const t = new ApplicationIntegrationTest("no shell");
    await t.post("/export");
    expect(t.response.location).toMatch(/\/$/);
    await t.get("/");
    expect(t.response.body).toContain("That needs the desktop app");
  });

  it("exports to and imports from the path the dialog picks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bookmarks-"));
    const path = join(dir, "out.json");
    await Bookmark.createBang({ title: "A", url: "https://a.example" });
    fakeDesktop({ pickExportPath: async () => path, pickImportFile: async () => path });

    const t = new ApplicationIntegrationTest("export");
    await t.post("/export");
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject([{ title: "A" }]);

    await writeFile(
      path,
      JSON.stringify([{ title: "B", url: "https://b.example", tags: ["new"] }]),
    );
    await t.post("/import");
    await t.get("/");
    expect(t.response.body).toContain("Imported 1 bookmarks (0 skipped).");
    expect(await Bookmark.count()).toBe(2);
  });

  it("attaches picked files and opens them through the shell", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bookmarks-"));
    const file = join(dir, "paper.pdf");
    await writeFile(file, "12345");
    const calls = fakeDesktop({ pickFiles: async () => [file] });
    const bookmark = await Bookmark.createBang({ title: "A", url: "https://a.example" });

    const t = new ApplicationIntegrationTest("attach");
    await t.post(`/bookmarks/${bookmark.id}/attachments`);
    const attachment = (await Attachment.first()) as Attachment;
    expect([attachment.name, Number(attachment.byte_size)]).toEqual(["paper.pdf", 5]);

    await t.get(`/bookmarks/${bookmark.id}`);
    expect(t.response.body).toContain("paper.pdf");
    await t.get(`/bookmarks/${bookmark.id}/attachments/${attachment.id}`);
    expect(t.response.status).toBe(204);
    expect(calls.opened).toEqual([file]);
  });
});
