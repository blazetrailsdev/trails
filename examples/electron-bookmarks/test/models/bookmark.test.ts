import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../test-helper.ts";
import { Bookmark } from "../../app/models/bookmark.ts";
import { Tag } from "../../app/models/tag.ts";

describe("BookmarkTest", () => {
  beforeEach(resetDatabase);

  it("requires an http(s) URL and a title", async () => {
    const bookmark = new Bookmark({ title: "", url: "ftp://example.com" });
    expect(await bookmark.save()).toBe(false);
    expect(bookmark.errors.fullMessages).toEqual([
      "Title can't be blank",
      "Url must start with http:// or https://",
    ]);
  });

  it("replaces tags from a comma-separated list, sharing tags by name", async () => {
    const a = await Bookmark.createBang({ title: "A", url: "https://a.example" });
    const b = await Bookmark.createBang({ title: "B", url: "https://b.example" });
    await a.setTagList("Ruby, js, ruby, ");
    await b.setTagList("js");
    expect(await a.tagNames()).toEqual(["js", "ruby"]);
    expect(await Tag.count()).toBe(2);
    await a.setTagList("ts");
    expect(await a.tagNames()).toEqual(["ts"]);
  });

  it("round-trips through a JSON export and skips URLs it already has", async () => {
    const a = await Bookmark.createBang({ title: "A", url: "https://a.example", notes: "x" });
    await a.setTagList("one,two");
    const json = await Bookmark.exportJson();
    await Bookmark.importRows([{ title: "dup", url: "https://a.example" }]);
    expect(await Bookmark.count()).toBe(1);

    await resetDatabase();
    const result = await Bookmark.importRows(Bookmark.parseExport(json, "bookmarks.json"));
    expect(result).toEqual({ imported: 1, skipped: 0 });
    const imported = await Bookmark.findByBang({ url: "https://a.example" });
    expect(imported.notes).toBe("x");
    expect(await imported.tagNames()).toEqual(["one", "two"]);
  });

  it("round-trips through a CSV export, quoting commas and quotes", async () => {
    const a = await Bookmark.createBang({ title: 'Say "hi", world', url: "https://a.example" });
    await a.setTagList("x,y");
    const csv = await Bookmark.exportCsv();
    expect(csv.split("\n")[1]).toBe('"Say ""hi"", world",https://a.example,,x;y,,');

    await resetDatabase();
    expect(await Bookmark.importRows(Bookmark.parseExport(csv, "b.CSV"))).toEqual({
      imported: 1,
      skipped: 0,
    });
    const imported = (await Bookmark.first()) as Bookmark;
    expect(imported.title).toBe('Say "hi", world');
    expect(await imported.tagNames()).toEqual(["x", "y"]);
  });

  it("finds unread bookmarks whose reminder is due and not yet sent", async () => {
    const past = new Date(Date.now() - 60_000);
    const due = await Bookmark.createBang({
      title: "due",
      url: "https://d.example",
      remind_at: past,
    });
    await Bookmark.createBang({
      title: "later",
      url: "https://l.example",
      remind_at: new Date(Date.now() + 3_600_000),
    });
    await Bookmark.createBang({
      title: "read",
      url: "https://r.example",
      remind_at: past,
      read_at: past,
    });
    await Bookmark.createBang({
      title: "sent",
      url: "https://s.example",
      remind_at: past,
      reminded_at: past,
    });
    const ids = ((await Bookmark.dueForReminder().toArray()) as Bookmark[]).map((b) => b.id);
    expect(ids).toEqual([due.id]);
  });
});
