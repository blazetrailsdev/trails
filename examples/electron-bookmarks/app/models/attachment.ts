import { basename } from "node:path";
import { stat } from "node:fs/promises";
import { ApplicationRecord } from "./application-record.ts";

/**
 * A local file linked to a bookmark. The file stays where it is on disk; the
 * row keeps its path, so "open" hands that path back to the OS.
 */
export class Attachment extends ApplicationRecord {
  declare path: string;
  declare name: string;
  declare byte_size: number | null;

  static {
    this.belongsTo("bookmark");
    this.validates("path", "name", { presence: true });
  }

  /** Builds an attachment for `path`, reading its name and size from disk. */
  static async fromPath(path: string): Promise<{ path: string; name: string; byte_size: number }> {
    const { size } = await stat(path);
    return { path, name: basename(path), byte_size: size };
  }
}
