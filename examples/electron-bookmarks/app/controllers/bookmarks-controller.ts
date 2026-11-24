import { ApplicationController } from "./application-controller.ts";
import { Bookmark } from "../models/bookmark.ts";
import { Tag } from "../models/tag.ts";
import type { Attachment } from "../models/attachment.ts";

export class BookmarksController extends ApplicationController {
  declare bookmark: Bookmark;
  declare bookmarks: Bookmark[];
  declare tags: Tag[];
  declare attachments: Attachment[];
  declare filter: string;
  declare currentTag: string | null;
  declare tagList: string;

  static {
    this.beforeAction(":_setBookmark", {
      only: ["show", "edit", "update", "destroy", "toggleRead"],
    });
  }

  async index(): Promise<void> {
    this.filter = this.params.get("filter") === "unread" ? "unread" : "all";
    this.currentTag = (this.params.get("tag") as string | undefined) ?? null;
    let scope = Bookmark.newestFirst();
    if (this.filter === "unread") scope = scope.merge(Bookmark.unread());
    if (this.currentTag != null)
      scope = scope.joins(":tags").where({ tags: { name: this.currentTag } });
    this.bookmarks = (await scope.includes("tags").toArray()) as Bookmark[];
    this.tags = await Tag.order({ name: "asc" }).toArray();
  }

  async show(): Promise<void> {
    this.attachments = (await this.bookmark.attachments
      .order({ name: "asc" })
      .toArray()) as Attachment[];
  }

  async new(): Promise<void> {
    this.bookmark = new Bookmark({ url: (this.params.get("url") as string | undefined) ?? "" });
    this.tagList = "";
  }

  async create(): Promise<void> {
    this.bookmark = new Bookmark(this._bookmarkParams());
    this.tagList = (this.params.get("tag_list") as string | undefined) ?? "";
    if (await this.bookmark.save()) {
      await this.bookmark.setTagList(this.tagList);
      await this.redirectTo(this.bookmarkPath(this.bookmark), { notice: "Bookmark saved." });
    } else {
      await this.render("new", { status: ":unprocessable_entity" });
    }
  }

  async edit(): Promise<void> {
    this.tagList = (await this.bookmark.tagNames()).join(", ");
  }

  async update(): Promise<void> {
    this.tagList = (this.params.get("tag_list") as string | undefined) ?? "";
    if (await this.bookmark.update(this._bookmarkParams())) {
      await this.bookmark.setTagList(this.tagList);
      await this.redirectTo(this.bookmarkPath(this.bookmark), { notice: "Bookmark updated." });
    } else {
      await this.render("edit", { status: ":unprocessable_entity" });
    }
  }

  async destroy(): Promise<void> {
    await this.bookmark.destroyBang();
    await this.redirectTo(this.bookmarksPath(), {
      notice: "Bookmark deleted.",
      status: ":see_other",
    });
  }

  async toggleRead(): Promise<void> {
    await this.bookmark.update({ read_at: this.bookmark.isRead() ? null : new Date() });
    await this.redirectBackOrTo(this.bookmarksPath(), { status: ":see_other" });
  }

  private async _setBookmark(): Promise<void> {
    this.bookmark = await Bookmark.find(this.params.get("id"));
  }

  private _bookmarkParams() {
    return this.params.expect({ bookmark: ["title", "url", "notes", "remind_at"] });
  }
}
