import {
  classModule,
  Encoding,
  File,
  IO,
  forceEncoding,
  rbModMethodDefined,
} from "@blazetrails/ruby-compat";
import { VERSION } from "./version.js";

const __FILE__ = decodeURIComponent(new URL(import.meta.url).pathname);

export class Configuration {
  static readonly [classModule] = true;

  static extDbPath = File.expandPath("../db/ext_mime.db", __FILE__);
  static contentTypeDbPath = File.expandPath("../db/content_type_mime.db", __FILE__);
}

export class Info {
  static readonly BINARY_ENCODINGS = ["base64", "8bit"];

  extension: string;
  contentType: string;
  encoding: string;

  constructor(buffer: string) {
    [this.extension, this.contentType, this.encoding] = buffer.split(/\s+/);
  }

  get(idx: number): string | null {
    if (idx === 0) {
      return this.extension;
    } else if (idx === 1) {
      return this.contentType;
    } else if (idx === 2) {
      return this.encoding;
    }
    return null;
  }

  isBinary(): boolean {
    return Info.BINARY_ENCODINGS.includes(this.encoding);
  }
}

export class Db {
  static lookupByFilename(filename: string): Info | null {
    let extension = File.extname(filename);
    if (extension.length === 0) return null;
    extension = extension.slice(1);
    return this.lookupByExtension(extension);
  }

  static lookupByExtension(extension: string): Info | null {
    this.db ??= new Db();
    return (
      this.db.lookupByExtension(extension) ?? this.db.lookupByExtension(extension.toLowerCase())
    );
  }

  static lookupByContentType(contentType: string): Info | null {
    this.db ??= new Db();
    return this.db.lookupByContentType(contentType);
  }

  private static db: Db | null = null;

  static Cache = class Cache {
    /** @internal */
    size: number;
    /** @internal */
    hash: Map<string, Info | null>;

    constructor(size: number) {
      this.size = size;
      this.hash = new Map();
    }

    set(key: string, val: Info | null): Info | null {
      const rval = val;
      this.hash.set(key, rval);
      if (this.hash.size > this.size) this.hash.delete(this.hash.keys().next().value!);
      return rval;
    }

    fetch(key: string, blk: () => Info | null): Info | null {
      return this.hash.has(key) ? this.hash.get(key)! : blk();
    }
  };

  static PReadFile = rbModMethodDefined(File, "pread")
    ? File
    : class PReadFile {
        /** @internal */
        file: File;

        constructor(filename: string) {
          this.file = File.open(filename, "rb");
        }

        readline(...args: [string?]): string | Uint8Array {
          return this.file.readline(...args);
        }

        pread(size: number, offset: number): Uint8Array {
          this.file.seek(offset, IO.SEEK_SET);
          return this.file.read(size)!;
        }
      };

  static RandomAccessDb = class RandomAccessDb {
    static readonly MAX_CACHED = 100;

    /** @internal */

    path: string;
    /** @internal */
    file: InstanceType<typeof Db.PReadFile>;
    /** @internal */
    rowLength: number;
    /** @internal */
    fileLength: number;
    /** @internal */
    rows: number;
    /** @internal */
    hitCache: InstanceType<typeof Db.Cache>;
    /** @internal */
    missCache: InstanceType<typeof Db.Cache>;
    /** @internal */
    sortOrder: number;

    constructor(path: string, sortOrder: number) {
      this.path = path;
      this.file = new Db.PReadFile(this.path);

      this.rowLength = (this.file.readline("\n") as string).length;
      this.fileLength = File.size(this.path);
      this.rows = Math.floor(this.fileLength / this.rowLength);

      this.hitCache = new Db.Cache(RandomAccessDb.MAX_CACHED);
      this.missCache = new Db.Cache(RandomAccessDb.MAX_CACHED);

      this.sortOrder = sortOrder;
    }

    lookup(val: string): Info | null {
      return this.hitCache.fetch(val, () => {
        return this.missCache.fetch(val, () => {
          const data = this.lookupUncached(val);
          if (data) {
            this.hitCache.set(val, data);
          } else {
            this.missCache.set(val, null);
          }

          return data;
        });
      });
    }

    lookupUncached(val: string): Info | null {
      let from = 0;
      let to = this.rows - 1;
      let result: Info | null = null;

      while (from <= to) {
        const midpoint = from + Math.floor((to - from) / 2);
        const current = this.resolve(midpoint);
        const data = current.get(this.sortOrder)!;
        if (data > val) {
          to = midpoint - 1;
        } else if (data < val) {
          from = midpoint + 1;
        } else {
          result = current;
          break;
        }
      }
      return result;
    }

    /** @missingRailsArgs force_encoding — PERMANENT */
    resolve(row: number): Info {
      return new Info(
        forceEncoding(
          this.file.pread(this.rowLength, row * this.rowLength),
          Encoding.UTF_8,
        ) as string,
      );
    }
  };

  private extDb: InstanceType<typeof Db.RandomAccessDb>;
  private contentTypeDb: InstanceType<typeof Db.RandomAccessDb>;

  constructor() {
    this.extDb = new Db.RandomAccessDb(Configuration.extDbPath, 0);
    this.contentTypeDb = new Db.RandomAccessDb(Configuration.contentTypeDbPath, 1);
  }

  lookupByExtension(extension: string): Info | null {
    return this.extDb.lookup(extension);
  }

  lookupByContentType(contentType: string): Info | null {
    return this.contentTypeDb.lookup(contentType);
  }
}

export const MiniMime = {
  VERSION,

  lookupByFilename(filename: string): Info | null {
    return Db.lookupByFilename(filename);
  },

  lookupByExtension(extension: string): Info | null {
    return Db.lookupByExtension(extension);
  },

  lookupByContentType(mime: string): Info | null {
    return Db.lookupByContentType(mime);
  },

  Configuration,
  Info,
  Db,
};

import "./class-paths.generated.js";
