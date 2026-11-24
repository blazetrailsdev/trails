import { ApplicationRecord } from "./application-record.ts";
import { Tag } from "./tag.ts";

const CSV_COLUMNS = ["title", "url", "notes", "tags", "read_at", "remind_at"] as const;

export interface BookmarkRow {
  title: string;
  url: string;
  notes?: string | null;
  tags?: string[];
  read_at?: string | null;
  remind_at?: string | null;
}

export class Bookmark extends ApplicationRecord {
  declare title: string;
  declare url: string;
  declare notes: string | null;
  declare read_at: Date | null;
  declare remind_at: Date | null;
  declare reminded_at: Date | null;

  static {
    this.hasMany("taggings", { dependent: "destroy" });
    this.hasMany("tags", { through: "taggings" });
    this.hasMany("attachments", { dependent: "destroy" });

    this.normalizes("url", { with: (url: string) => url.trim() });
    this.validates("title", { presence: true, length: { maximum: 200 } });
    this.validates("url", {
      presence: true,
      uniqueness: true,
      format: { with: /^https?:\/\/\S+$/, message: "must start with http:// or https://" },
    });

    this.scope("unread", function () {
      return this.where({ read_at: null });
    });
    this.scope("newestFirst", function () {
      return this.order({ created_at: "desc", id: "desc" });
    });
    this.scope("dueForReminder", function (now: Date = new Date()) {
      return this.where({ read_at: null, reminded_at: null }).where("remind_at <= ?", now);
    });
  }

  isRead(): boolean {
    return this.read_at != null;
  }

  async tagNames(): Promise<string[]> {
    const tags = (await this.tags.toArray()) as Tag[];
    return tags.map((tag) => tag.name).sort();
  }

  /** Replaces the bookmark's tags with the comma-separated names in `list`. */
  async setTagList(list: string): Promise<void> {
    const names = [...new Set(list.split(",").map((n) => n.trim().toLowerCase()))].filter(
      (n) => n !== "",
    );
    const tags: Tag[] = [];
    for (const name of names) tags.push((await Tag.findOrCreateByBang({ name })) as Tag);
    await this.taggings.destroyAll();
    for (const tag of tags) await this.taggings.createBang({ tag });
    this.tags.reset();
  }

  async toRow(): Promise<BookmarkRow> {
    return {
      title: this.title,
      url: this.url,
      notes: this.notes ?? null,
      tags: await this.tagNames(),
      read_at: this.read_at?.toISOString() ?? null,
      remind_at: this.remind_at?.toISOString() ?? null,
    };
  }

  static async exportRows(): Promise<BookmarkRow[]> {
    const bookmarks = await Bookmark.order({ id: "asc" }).toArray();
    const rows: BookmarkRow[] = [];
    for (const bookmark of bookmarks) rows.push(await bookmark.toRow());
    return rows;
  }

  static async exportJson(): Promise<string> {
    return JSON.stringify(await Bookmark.exportRows(), null, 2) + "\n";
  }

  static async exportCsv(): Promise<string> {
    const lines = [CSV_COLUMNS.join(",")];
    for (const row of await Bookmark.exportRows()) {
      const cells = CSV_COLUMNS.map((col) =>
        col === "tags" ? (row.tags ?? []).join(";") : (row[col] ?? ""),
      );
      lines.push(cells.map(csvCell).join(","));
    }
    return lines.join("\n") + "\n";
  }

  /**
   * Creates a bookmark for each row whose URL is not already saved, and answers
   * how many were imported and how many skipped.
   */
  static async importRows(rows: BookmarkRow[]): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;
    for (const row of rows) {
      if (await Bookmark.isExists({ url: row.url?.trim() })) {
        skipped++;
        continue;
      }
      const bookmark = new Bookmark({
        title: row.title,
        url: row.url,
        notes: row.notes ?? null,
        read_at: row.read_at ? new Date(row.read_at) : null,
        remind_at: row.remind_at ? new Date(row.remind_at) : null,
      });
      if (!(await bookmark.save())) {
        skipped++;
        continue;
      }
      await bookmark.setTagList((row.tags ?? []).join(","));
      imported++;
    }
    return { imported, skipped };
  }

  /** Parses an export file, JSON or CSV by its extension. */
  static parseExport(text: string, path: string): BookmarkRow[] {
    if (path.toLowerCase().endsWith(".csv")) return parseCsv(text);
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) throw new SyntaxError("expected a JSON array of bookmarks");
    return data as BookmarkRow[];
  }
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function parseCsv(text: string): BookmarkRow[] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || record.length > 0) records.push([...record, field]);
  const [header, ...body] = records.filter((r) => r.some((cell) => cell !== ""));
  if (!header) return [];
  return body.map((cells) => {
    const get = (name: string) => cells[header.indexOf(name)] ?? "";
    return {
      title: get("title"),
      url: get("url"),
      notes: get("notes") || null,
      tags: get("tags")
        .split(";")
        .filter((t) => t !== ""),
      read_at: get("read_at") || null,
      remind_at: get("remind_at") || null,
    };
  });
}
