import { assertValidKeys, isPlainObject } from "@blazetrails/activesupport";
import { ConfigurationFile } from "@blazetrails/activesupport/configuration-file";

import { FormatError } from "../fixtures.js";
import { RenderContext } from "./render-context.js";

export class File {
  #file: string;
  #rows?: [string, unknown][];
  #configRow?: Record<string, unknown>;
  #rawRows?: [string, unknown][];

  static open(file: string): File;
  static open<T>(file: string, block: (fh: File) => T): T;
  static open<T>(file: string, block?: (fh: File) => T): File | T {
    const x = new File(file);
    return block !== undefined ? block(x) : x;
  }

  constructor(file: string) {
    this.#file = file;
  }

  each(): [string, unknown][];
  each(block: (row: [string, unknown]) => void): void;
  each(block?: (row: [string, unknown]) => void): [string, unknown][] | void {
    if (block === undefined) return this.rows();
    this.rows().forEach(block);
  }

  get modelClass(): unknown {
    return this.configRow()["model_class"];
  }

  get ignoredFixtures(): unknown {
    return this.configRow()["ignore"];
  }

  private rows(): [string, unknown][] {
    return (this.#rows ??= this.rawRows().filter(([fixtureName]) => fixtureName !== "_fixture"));
  }

  private configRow(): Record<string, unknown> {
    if (this.#configRow === undefined) {
      const row = this.rawRows().find(([fixtureName]) => fixtureName === "_fixture");
      this.#configRow = row ? this.validateConfigRow(row[1]) : { model_class: null, ignore: null };
    }
    return this.#configRow;
  }

  private rawRows(): [string, unknown][] {
    if (this.#rawRows === undefined) {
      let data: unknown;
      try {
        data = ConfigurationFile.parse(this.#file, {
          context: new (RenderContext.createSubclass())().getBinding(),
        });
      } catch (error: unknown) {
        if (!(error instanceof ConfigurationFile.FormatError)) throw error;
        throw new FormatError(error.message);
      }
      this.#rawRows = data != null && data !== false ? Object.entries(this.validate(data)) : [];
    }
    return this.#rawRows;
  }

  private validateConfigRow(data: unknown): Record<string, unknown> {
    if (!isPlainObject(data)) {
      throw new FormatError(
        `Invalid \`_fixture\` section: \`_fixture\` must be a hash: ${this.#file}`,
      );
    }

    try {
      assertValidKeys(data, ["model_class", "ignore"]);
    } catch (error: unknown) {
      throw new FormatError(
        `Invalid \`_fixture\` section: ${(error as Error).message}: ${this.#file}`,
      );
    }

    return data;
  }

  private validate(data: unknown): Record<string, unknown> {
    if (!isPlainObject(data)) {
      throw new FormatError(`fixture is not a hash: ${this.#file}`);
    }

    const invalid = Object.entries(data).filter(([, row]) => !isPlainObject(row));
    if (invalid.length > 0) {
      throw new FormatError(
        `fixture key is not a hash: ${this.#file}, keys: ` +
          `[${invalid.map(([key]) => JSON.stringify(key)).join(", ")}]`,
      );
    }
    return data;
  }
}
