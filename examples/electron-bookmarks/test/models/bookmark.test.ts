import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "../test-helper.ts";
import { Bookmark } from "../../app/models/bookmark.ts";
import { Tag } from "../../app/models/tag.ts";

afterEach(() => vi.unstubAllGlobals());

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

describe("BookmarkReminderTimeZoneTest", () => {
  beforeEach(resetDatabase);

  it("reads a datetime-local reminder as the machine's wall-clock time", async () => {
    const bookmark = await Bookmark.createBang({
      title: "A",
      url: "https://a.example",
      remind_at: "2026-06-01T09:30",
    });
    await bookmark.reload();
    expect(bookmark.remind_at!.getTime()).toBe(new Date(2026, 5, 1, 9, 30).getTime());
  });
});

describe("BookmarkImportTest", () => {
  beforeEach(resetDatabase);

  it("skips rows with no URL without querying for one", async () => {
    const rows = [{ title: "no url" }, { title: "blank", url: "  " }] as never;
    expect(await Bookmark.importRows(rows)).toEqual({ imported: 0, skipped: 2 });
  });

  it("rolls back and skips a row whose tags fail to save, keeping the rest", async () => {
    const result = await Bookmark.importRows([
      { title: "A", url: "https://a.example", tags: ["x".repeat(41)] },
      { title: "B", url: "https://b.example", tags: ["ok"] },
    ]);
    expect(result).toEqual({ imported: 1, skipped: 1 });
    const urls = (await Bookmark.order({ id: "asc" }).toArray()).map((b) => b.url);
    expect(urls).toEqual(["https://b.example"]);
  });

  it("neutralizes spreadsheet formulas in a CSV export and restores them on import", async () => {
    await Bookmark.createBang({ title: "=HYPERLINK(1)", url: "https://a.example" });
    const csv = await Bookmark.exportCsv();
    expect(csv.split("\n")[1]).toBe("'=HYPERLINK(1),https://a.example,,,,");
    await resetDatabase();
    await Bookmark.importRows(Bookmark.parseExport(csv, "b.csv"));
    expect(((await Bookmark.first()) as Bookmark).title).toBe("=HYPERLINK(1)");
  });

  it("fills a blank title from the page's <title>", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("<html><head><title>\n  Ruby &amp; Rails  </title></head></html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const bookmark = await Bookmark.createBang({ url: "https://rails.example/guide" });
    expect(bookmark.title).toBe("Ruby & Rails");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("falls back to the host when the page can't be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    const bookmark = await Bookmark.createBang({ url: "https://offline.example/a" });
    expect(bookmark.title).toBe("offline.example");
  });

  it("keeps a title that was entered without fetching", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const bookmark = await Bookmark.createBang({ title: "Mine", url: "https://x.example" });
    expect(bookmark.title).toBe("Mine");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("titles an untitled import row with its host without fetching the page", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await Bookmark.importRows([{ title: "", url: "https://untitled.example/x" }]);
    expect(result).toEqual({ imported: 1, skipped: 0 });
    expect(((await Bookmark.first()) as Bookmark).title).toBe("untitled.example");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports an unparseable URL as invalid instead of raising", async () => {
    const bookmark = new Bookmark({ url: "http://[" });
    expect(await bookmark.save()).toBe(false);
    expect(bookmark.errors.fullMessages).toContain("Title can't be blank");
  });
});
