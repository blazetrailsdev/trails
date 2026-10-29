import { Encoding, File, forceEncoding } from "@blazetrails/ruby-compat";
import { VERSION } from "./version.js";

const __FILE__ = decodeURIComponent(new URL(import.meta.url).pathname);

function lookupByFilename(filename: string): Info | null {
  return Db.lookupByFilename(filename);
}

function lookupByExtension(extension: string): Info | null {
  return Db.lookupByExtension(extension);
}

function lookupByContentType(mime: string): Info | null {
  return Db.lookupByContentType(mime);
}

export class Configuration {
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

export class Cache {
  private size: number;
  private hash: Map<string, Info | null>;

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
}

export class RandomAccessDb {
  static readonly MAX_CACHED = 100;

  private path: string;
  private file: File;
  private rowLength: number;
  private fileLength: number;
  private rows: number;
  private hitCache: Cache;
  private missCache: Cache;
  private sortOrder: number;

  constructor(path: string, sortOrder: number) {
    this.path = path;
    this.file = Db.PReadFile.open(this.path);

    this.rowLength = (this.file.readline() as string).length;
    this.fileLength = File.size(this.path);
    this.rows = Math.floor(this.fileLength / this.rowLength);

    this.hitCache = new Cache(RandomAccessDb.MAX_CACHED);
    this.missCache = new Cache(RandomAccessDb.MAX_CACHED);

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

  static Cache = Cache;
  static PReadFile = File;
  static RandomAccessDb = RandomAccessDb;

  private extDb: RandomAccessDb;
  private contentTypeDb: RandomAccessDb;

  constructor() {
    this.extDb = new RandomAccessDb(Configuration.extDbPath, 0);
    this.contentTypeDb = new RandomAccessDb(Configuration.contentTypeDbPath, 1);
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
  lookupByFilename,
  lookupByExtension,
  lookupByContentType,
  Configuration,
  Info,
  Db,
};
