import { assertValidKeys, isPlainObject } from "@blazetrails/activesupport";
import { Enumerable, include, rtest, RuntimeError } from "@blazetrails/ruby-compat";
import { ConfigurationFile } from "@blazetrails/activesupport/configuration-file";

import { FormatError } from "../fixtures.js";
import { RenderContext } from "./render-context.js";

const fixtureModules = new Map<string, Record<string, unknown>>();

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Enumerable` (fixture_set/file.rb:8); the class/interface merge is how `include()` surfaces on the type side.
export class File {
  /** @noRailsEquivalent PERMANENT */
  static registerModule(file: string, rows: Record<string, unknown>): void {
    fixtureModules.set(file, rows);
  }

  /** @noRailsEquivalent PERMANENT */
  static modules(): string[] {
    return [...fixtureModules.keys()];
  }

  private file: string;
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
    this.file = file;
  }

  each(block: (row: [string, unknown]) => void): void {
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
    return (this.#configRow ??= (() => {
      const row = this.rawRows().find(([fixtureName]) => fixtureName === "_fixture");
      if (row) {
        return this.validateConfigRow(row[1]);
      } else {
        return { model_class: null, ignore: null };
      }
    })());
  }

  /** @inventedArm if — PERMANENT */
  private rawRows(): [string, unknown][] {
    return (this.#rawRows ??= (() => {
      try {
        let data: unknown;
        const rows = fixtureModules.get(this.file);
        if (rows !== undefined) {
          data = Object.fromEntries(
            Object.entries(rows).map(([key, row]) => [key, isPlainObject(row) ? { ...row } : row]),
          );
        } else {
          data = ConfigurationFile.parse(this.file, {
            context: new (RenderContext.createSubclass())().getBinding(),
          });
        }
        return rtest(data) ? toA(this.validate(data)) : [];
      } catch (error: unknown) {
        if (!(error instanceof RuntimeError)) throw error;
        throw new FormatError(error.message);
      }
    })());
  }

  private validateConfigRow(data: unknown): Record<string, unknown> {
    if (!isPlainObject(data)) {
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

  private validate(data: unknown): Record<string, unknown> | Map<unknown, unknown> {
    if (!isPlainObject(data) && !(data instanceof Map)) {
      throw new FormatError(`fixture is not a hash: ${this.file}`);
    }

    const invalid = toA(data).filter(([, row]) => !isPlainObject(row));
    if (invalid.length > 0) {
      throw new FormatError(
        `fixture key is not a hash: ${this.file}, keys: ` +
          `[${invalid.map(([key]) => JSON.stringify(key)).join(", ")}]`,
      );
    }
    return data;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Enumerable` (fixture_set/file.rb:8); the class/interface merge is how `include()` surfaces on the type side.
export interface File {
  [Symbol.iterator](): IterableIterator<[string, unknown]>;
}

include(File, Enumerable);

function toA(hash: Record<string, unknown> | Map<unknown, unknown>): [string, unknown][] {
  return hash instanceof Map
    ? [...hash].map(([key, value]) => [String(key), value])
    : Object.entries(hash);
}
