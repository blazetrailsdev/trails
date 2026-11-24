import { writeFile } from "node:fs/promises";
import { ApplicationController } from "./application-controller.ts";
import { Bookmark } from "../models/bookmark.ts";

export class ExportsController extends ApplicationController {
  /** Asks where to save, then writes every bookmark as JSON or CSV by the chosen extension. */
  async create(): Promise<void> {
    const desktop = this._desktop();
    if (desktop == null) return this._redirectWithoutDesktop();
    const path = await desktop.pickExportPath("bookmarks.json");
    if (path == null) {
      await this.redirectTo(this.rootPath(), { status: ":see_other" });
      return;
    }
    const text = path.toLowerCase().endsWith(".csv")
      ? await Bookmark.exportCsv()
      : await Bookmark.exportJson();
    await writeFile(path, text);
    await this.redirectTo(this.rootPath(), {
      notice: `Exported ${await Bookmark.count()} bookmarks to ${path}.`,
      status: ":see_other",
    });
  }
}
