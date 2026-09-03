import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import type { CacheOptions, CacheStore } from "./index.js";
import { Entry } from "./entry.js";
import { ArgumentError, Store, inspectOptions, type StoreOptions } from "./store.js";
import { atomicWrite } from "../core-ext/file/atomic.js";
import { kernelInteger } from "@blazetrails/ruby-compat";
import { hexdigest } from "../hexdigest.js";
import { registerStoreClass } from "./store-registry.js";
import { isEmpty } from "@blazetrails/ruby-compat";

export const FILENAME_MAX_SIZE = 226;
const FILEPATH_MAX_SIZE = 900;
const GITKEEP_FILES = [".gitkeep", ".keep"];

function dirFormatter(dir: number): string {
  return dir.toString(16).toUpperCase().padStart(3, "0");
}

const UTF8 = new TextEncoder();

/** @noRailsEquivalent PERMANENT */
function adler32(data: string): number {
  let a = 1;
  let b = 0;
  for (const byte of UTF8.encode(data)) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return b * 0x10000 + a;
}

/** @noRailsEquivalent PERMANENT */
function encodeWwwFormComponent(str: string): string {
  return encodeURIComponent(str)
    .replace(/[!'()~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
}

/** @noRailsEquivalent PERMANENT */
function decodeWwwFormComponent(str: string): string {
  return decodeURIComponent(str.replace(/\+/g, " "));
}

export class FileStore extends Store implements CacheStore {
  get cachePath(): string {
    return this._cachePath;
  }

  static supportsCacheVersioning(): boolean {
    return true;
  }

  private _cachePath: string;

  constructor(cachePath: string, options?: CacheOptions) {
    super(options ?? {});
    if (cachePath === undefined) {
      throw new ArgumentError("wrong number of arguments (given 0, expected 1)");
    }
    this._cachePath = String(cachePath);
  }

  override clear(): void {
    try {
      const rootDirs = Dir.children(this.cachePath).filter((f) => !GITKEEP_FILES.includes(f));
      FileUtils.rmR(rootDirs.map((f) => File.join(this.cachePath, f)));
    } catch {}
  }

  override cleanup(options?: CacheOptions): void {
    options = this.mergedOptions(options);
    this.searchDir(this.cachePath, (fname) => {
      const entry = this.readEntry(fname, options);
      if (entry && entry.isExpired()) this.deleteEntry(fname, options);
    });
  }

  override increment(name: string, amount = 1, options?: StoreOptions): number | null {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    return this.instrument("increment", key, { amount }, () =>
      this.modifyValue(name, amount, options),
    );
  }

  override decrement(name: string, amount = 1, options?: StoreOptions): number | null {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    return this.instrument("decrement", key, { amount }, () =>
      this.modifyValue(name, -amount, options),
    );
  }

  override deleteMatched(matcher: string | RegExp, options?: StoreOptions): void {
    options = this.mergedOptions(options);
    if (typeof matcher === "string") matcher = new RegExp(matcher);
    matcher = this.keyMatcher(matcher, options);

    this.instrument("delete_matched", String(matcher), undefined, () => {
      this.searchDir(this.cachePath, (path) => {
        const key = this.filePathKey(path);
        if (key.match(matcher) !== null) this.deleteEntry(path, options);
      });
    });
  }

  inspect(): string {
    return `#<${this.constructor.name} cache_path=${this._cachePath}, options=${inspectOptions(
      this.options as Record<string, unknown>,
    )}>`;
  }

  protected readEntry(key: string, _options: StoreOptions): Entry | null {
    const payload = this.readSerializedEntry(key);
    if (payload != null) {
      const entry = this.deserializeEntry(payload);
      return entry instanceof Entry ? entry : null;
    }
    return null;
  }

  protected readSerializedEntry(key: string): string | null {
    try {
      return File.isExist(key) ? File.binread(key) : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Store.logger?.error?.(`FileStoreError (${message}): ${message}`);
      return null;
    }
  }

  protected writeEntry(key: string, entry: Entry, options: StoreOptions = {}): boolean {
    return this.writeSerializedEntry(key, this.serializeEntry(entry, options) as string, options);
  }

  protected writeSerializedEntry(key: string, payload: string, options: StoreOptions): boolean {
    if (options.unlessExist && File.isExist(key)) return false;
    this.ensureCachePath(File.dirname(key));
    atomicWrite(key, this.cachePath, (f) => f.write(payload));
    return true;
  }

  protected deleteEntry(key: string, _options: StoreOptions): boolean {
    if (File.isExist(key)) {
      try {
        File.delete(key);
        this.deleteEmptyDirectories(File.dirname(key));
        return true;
      } catch (error) {
        if (File.isExist(key)) throw error;
        return false;
      }
    } else {
      return false;
    }
  }

  protected lockFile<T>(fileName: string, block: () => T): T {
    if (File.isExist(fileName)) {
      return File.open(fileName, "r+", (f) => {
        try {
          f.flock(File.LOCK_EX);
          return block();
        } finally {
          f.flock(File.LOCK_UN);
        }
      });
    } else {
      return block();
    }
  }

  protected override normalizeKey(key: unknown, options?: StoreOptions): string {
    key = super.normalizeKey(key, options);
    let fname = encodeWwwFormComponent(key as string);

    if (fname.length > FILEPATH_MAX_SIZE) {
      fname = hexdigest(key as string);
    }

    let hash = adler32(fname);
    const dir1 = hash % 0x1000;
    hash = Math.floor(hash / 0x1000);
    const dir2 = hash % 0x1000;

    let fnamePaths: string[];
    if (fname.length < FILENAME_MAX_SIZE) {
      fnamePaths = [fname];
    } else {
      fnamePaths = [];
      do {
        fnamePaths.push(fname.slice(0, FILENAME_MAX_SIZE));
        fname = fname.slice(FILENAME_MAX_SIZE);
      } while (fname !== "");
    }

    return File.join(this.cachePath, dirFormatter(dir1), dirFormatter(dir2), ...fnamePaths);
  }

  /**
   * @missingRailsCall delete — PERMANENT
   * @missingRailsCall last — PERMANENT
   */
  protected filePathKey(path: string): string {
    const sep = File.SEPARATOR;
    const fname = path.slice(this.cachePath.length).split(sep).slice(3).join("");
    return decodeWwwFormComponent(fname);
  }

  private deleteEmptyDirectories(dir: string): void {
    if (File.realpath(dir) === File.realpath(this.cachePath)) return;
    if (isEmpty(Dir.children(dir))) {
      try {
        Dir.delete(dir);
      } catch {}
      this.deleteEmptyDirectories(File.dirname(dir));
    }
  }

  protected ensureCachePath(path: string): void {
    if (!File.isExist(path)) FileUtils.makedirs(path);
  }

  protected searchDir(dir: string, callback: (path: string) => void): void {
    if (!File.isExist(dir)) return;
    Dir.eachChild(dir, (d) => {
      const name = File.join(dir, d);
      if (File.isDirectory(name)) {
        this.searchDir(name, callback);
      } else {
        callback(name);
      }
    });
  }

  private modifyValue(name: string, amount: number, options: StoreOptions): number {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    const version = this.normalizeVersion(name, options) ?? null;
    amount = kernelInteger(amount);

    return this.lockFile(key, () => {
      let entry = this.readEntry(key, options);

      if (!entry || entry.isExpired() || entry.isMismatched(version)) {
        this.write(name, amount, options);
        return amount;
      } else {
        const num = toI(entry.value) + amount;
        entry = new Entry(num, { expiresAt: entry.expiresAt, version: entry.version });
        this.writeEntry(key, entry);
        return num;
      }
    });
  }
}

function toI(value: unknown): number {
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const m = value.match(/^\s*[-+]?\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }
  return 0;
}

registerStoreClass(":file_store", FileStore);
