import { readFile } from "node:fs/promises";
import { ApplicationController } from "./application-controller.ts";
import { Bookmark } from "../models/bookmark.ts";

export class ImportsController extends ApplicationController {
  /** Asks for a JSON or CSV export and adds the bookmarks it does not already have. */
  async create(): Promise<void> {
    const desktop = this._desktop();
    if (desktop == null) return this._redirectWithoutDesktop();
    const path = await desktop.pickImportFile();
    if (path == null) {
      await this.redirectTo(this.rootPath(), { status: ":see_other" });
      return;
    }
    let rows;
    try {
      rows = Bookmark.parseExport(await readFile(path, "utf8"), path);
    } catch (error) {
      await this.redirectTo(this.rootPath(), {
        alert: `Couldn't read ${path}: ${(error as Error).message}`,
        status: ":see_other",
      });
      return;
    }
    const { imported, skipped } = await Bookmark.importRows(rows);
    await this.redirectTo(this.rootPath(), {
      notice: `Imported ${imported} bookmarks (${skipped} skipped).`,
      status: ":see_other",
    });
  }
}
