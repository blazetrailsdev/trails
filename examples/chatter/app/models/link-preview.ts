import { ApplicationRecord } from "./application-record.ts";

export class LinkPreview extends ApplicationRecord {
  static {
    this.belongsTo("message");
  }

  host(): string {
    try {
      return new URL(this.url).host;
    } catch {
      return this.url;
    }
  }
}
