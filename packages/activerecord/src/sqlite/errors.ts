export class Exception extends Error {
  code: number | null = null;

  sql: string | null = null;

  sqlOffset = -1;

  #message: string;

  constructor(message?: string) {
    super(message);
    this.name = "SQLite3::Exception";
    this.#message = this.message;
    delete (this as { message?: string }).message;
  }

  override get message(): string {
    return [this.#message, this.sqlError()].filter((s) => s != null).join(":\n");
  }

  /** @internal */
  private sqlError(): string | null {
    if (this.sql == null) return null;
    if (!(this.sqlOffset >= 0)) return this.sql.replace(/\r?\n$/, "");

    let offset = this.sqlOffset;
    return this.sql
      .split(/(?<=\n)/)
      .flatMap((line) => {
        if (offset >= 0 && line.length > offset) {
          const blanks = " ".repeat(offset);
          offset = -1;
          return [line.replace(/\r?\n$/, ""), blanks + "^"];
        } else {
          offset -= line.length;
          return line.replace(/\r?\n$/, "");
        }
      })
      .join("\n");
  }
}
