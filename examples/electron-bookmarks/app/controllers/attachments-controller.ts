import { ApplicationController } from "./application-controller.ts";
import { Attachment } from "../models/attachment.ts";
import { Bookmark } from "../models/bookmark.ts";

export class AttachmentsController extends ApplicationController {
  declare bookmark: Bookmark;

  static {
    this.beforeAction(":_setBookmark");
  }

  /** Opens the native file picker and links each chosen file to the bookmark. */
  async create(): Promise<void> {
    const desktop = this._desktop();
    if (desktop == null) return this._redirectWithoutDesktop();
    const paths = await desktop.pickFiles();
    for (const path of paths)
      await this.bookmark.attachments.createBang(await Attachment.fromPath(path));
    const notice =
      paths.length === 0
        ? undefined
        : `Attached ${paths.length} file${paths.length === 1 ? "" : "s"}.`;
    await this.redirectTo(this.bookmarkPath(this.bookmark), { notice, status: ":see_other" });
  }

  /** Opens the attached file in its default application. */
  async open(): Promise<void> {
    const desktop = this._desktop();
    if (desktop == null) return this._redirectWithoutDesktop();
    const attachment = (await this.bookmark.attachments.find(this.params.get("id"))) as Attachment;
    await desktop.openPath(attachment.path);
    await this.head(":no_content");
  }

  async destroy(): Promise<void> {
    const attachment = (await this.bookmark.attachments.find(this.params.get("id"))) as Attachment;
    await attachment.destroyBang();
    await this.redirectTo(this.bookmarkPath(this.bookmark), { status: ":see_other" });
  }

  private async _setBookmark(): Promise<void> {
    this.bookmark = await Bookmark.find(this.params.get("bookmark_id"));
  }
}
