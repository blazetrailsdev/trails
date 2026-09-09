import { assertValidKeys, ConfigurationFile } from "@blazetrails/activesupport";

import { FormatError } from "../fixtures.js";
import { RenderContext } from "./render-context.js";

export type FixtureRow = [string, unknown];

export class File {
  private file: string;
  private memoRows?: FixtureRow[];
  private memoConfigRow?: Record<string, unknown>;
  private memoRawRows?: FixtureRow[];

  static open(file: string): File;
  static open<T>(file: string, block: (fh: File) => T): T;
  static open<T>(file: string, block?: (fh: File) => T): File | T {
    const x = new File(file);
    return block !== undefined ? block(x) : x;
  }

  constructor(file: string) {
    this.file = file;
  }

  each(): FixtureRow[];
  each(block: (row: FixtureRow) => void): void;
  each(block?: (row: FixtureRow) => void): FixtureRow[] | void {
    if (block === undefined) return this.rows();
    this.rows().forEach(block);
  }

  get modelClass(): unknown {
    return this.configRow()["model_class"];
  }

  get ignoredFixtures(): unknown {
    return this.configRow()["ignore"];
  }

  private rows(): FixtureRow[] {
    return (this.memoRows ??= this.rawRows().filter(([fixtureName]) => fixtureName !== "_fixture"));
  }

  private configRow(): Record<string, unknown> {
    if (this.memoConfigRow === undefined) {
      const row = this.rawRows().find(([fixtureName]) => fixtureName === "_fixture");
      this.memoConfigRow = row
        ? this.validateConfigRow(row[row.length - 1])
        : { ":model_class": null, ":ignore": null };
    }
    return this.memoConfigRow;
  }

  private rawRows(): FixtureRow[] {
    if (this.memoRawRows === undefined) {
      let data: unknown;
      try {
        data = ConfigurationFile.parse(this.file, {
          context: new (RenderContext.createSubclass())().getBinding(),
        });
      } catch (error: unknown) {
        if (!(error instanceof ConfigurationFile.FormatError)) throw error;
        throw new FormatError(error.message);
      }
      this.memoRawRows =
        data != null && data !== false ? (Object.entries(this.validate(data)) as FixtureRow[]) : [];
    }
    return this.memoRawRows;
  }

  private validateConfigRow(data: unknown): Record<string, unknown> {
    if (!isHash(data)) {
      throw new FormatError(
        `Invalid \`_fixture\` section: \`_fixture\` must be a hash: ${this.file}`,
      );
    }

    try {
      assertValidKeys(data, ["model_class", "ignore"]);
    } catch (error: unknown) {
      throw new FormatError(
        `Invalid \`_fixture\` section: ${(error as Error).message}: ${this.file}`,
      );
    }

    return data;
  }

  private validate(data: unknown): Record<string, unknown> {
    if (!isHash(data)) {
      throw new FormatError(`fixture is not a hash: ${this.file}`);
    }

    const invalid = Object.entries(data).filter(([, row]) => !isHash(row));
    if (invalid.length > 0) {
      throw new FormatError(
        `fixture key is not a hash: ${this.file}, keys: ` +
          `[${invalid.map(([key]) => JSON.stringify(key)).join(", ")}]`,
      );
    }
    return data;
  }
}

function isHash(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
