import { Dir, File, FileUtils, getFs } from "@blazetrails/ruby-compat";
import type { CacheOptions, CacheStore } from "./index.js";
import { Entry } from "./entry.js";
import { ArgumentError, Store, inspectOptions, type StoreOptions } from "./store.js";
import { atomicWrite } from "../core-ext/file/atomic.js";
import { Integer } from "./integer.js";
import { hexdigest } from "../hexdigest.js";
import { registerStoreClass } from "./store-registry.js";
import { isEmpty } from "@blazetrails/ruby-compat";

// max filename size on file system is 255, minus room for timestamp, pid, and
// random characters appended by Tempfile (file_store.rb:16)
export const FILENAME_MAX_SIZE = 226;
// max is 1024, plus some room (file_store.rb:17)
const FILEPATH_MAX_SIZE = 900;
const GITKEEP_FILES = [".gitkeep", ".keep"];

// Ruby `DIR_FORMATTER = "%03X"` (file_store.rb:15).
function dirFormatter(dir: number): string {
  return dir.toString(16).toUpperCase().padStart(3, "0");
}

const UTF8 = new TextEncoder();

/**
 * Ruby `Zlib.adler32`. Ruby's zlib is a stdlib C extension with no trails
 * counterpart, and the digest picks the cache's shard directories, so it has to
 * be the same function.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib (Zlib), not Rails, so no Ruby file
 * maps onto it; named for the method `normalize_key` calls at file_store.rb:167.
 */
function adler32(data: string): number {
  let a = 1;
  let b = 0;
  for (const byte of UTF8.encode(data)) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return b * 0x10000 + a;
}

/**
 * Ruby `URI.encode_www_form_component`: everything but `*-._` and alphanumerics
 * is percent-encoded and a space becomes `+`. `encodeURIComponent` also leaves
 * `!~'()` unescaped, so those are escaped here.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib (URI), not Rails, so no Ruby file
 * maps onto it; named for the method `normalize_key` calls at file_store.rb:160.
 */
function encodeWwwFormComponent(str: string): string {
  return encodeURIComponent(str)
    .replace(/[!'()~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
}

/**
 * Ruby `URI.decode_www_form_component`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib (URI), not Rails, so no Ruby file
 * maps onto it; named for the method `file_path_key` calls at file_store.rb:186.
 */
function decodeWwwFormComponent(str: string): string {
  return decodeURIComponent(str.replace(/\+/g, " "));
}

export class FileStore extends Store implements CacheStore {
  /** Mirrors Rails `attr_reader :cache_path` (file_store.rb:13). */
  get cachePath(): string {
    return this._cachePath;
  }

  /** Advertise cache versioning support (file_store.rb:25-28). */
  static supportsCacheVersioning(): boolean {
    return true;
  }

  private _cachePath: string;

  /**
   * `cache_path` is a required positional (file_store.rb:19), so Ruby raises
   * ArgumentError from arity when `Cache.lookup_store :file_store` supplies
   * none. TypeScript passes `undefined` instead, so the arity check is explicit.
   */
  constructor(cachePath: string, options?: CacheOptions) {
    super(options ?? {});
    if (cachePath === undefined) {
      throw new ArgumentError("wrong number of arguments (given 0, expected 1)");
    }
    this._cachePath = String(cachePath);
  }

  // Mirrors Rails FileStore#clear (file_store.rb:33-36): deletes everything in
  // the cache directory except .keep / .gitkeep, swallowing ENOENT/ENOTEMPTY.
  override clear(): void {
    try {
      const rootDirs = Dir.children(this.cachePath).filter((f) => !GITKEEP_FILES.includes(f));
      FileUtils.rmR(rootDirs.map((f) => File.join(this.cachePath, f)));
    } catch {}
  }

  // Mirrors Rails FileStore#cleanup (file_store.rb:39-45): walks every stored
  // file and deletes the expired ones. `search_dir` yields file *paths*, which
  // are exactly what normalizeKey produces, so they feed read/delete_entry.
  override cleanup(options?: CacheOptions): void {
    options = this.mergedOptions(options);
    this.searchDir(this.cachePath, (fname) => {
      const entry = this.readEntry(fname, options);
      if (entry && entry.isExpired()) this.deleteEntry(fname, options);
    });
  }

  // Rails FileStore instruments increment/decrement with the normalized key
  // (file_store.rb:62-64), unlike MemoryStore which uses the raw name.
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

  // Mirrors Rails FileStore#delete_matched (file_store.rb:86-95): the matcher is
  // run through keyMatcher (so a namespaced store scopes the deletion to its own
  // keys) and compared against the key recovered from each file path.
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

  // Mirrors Rails FileStore#inspect (file_store.rb:97-99). Ruby's
  // `self.class.name` is the fully-qualified constant; TS has only the class
  // name, which is the same last segment.
  inspect(): string {
    return `#<${this.constructor.name} cache_path=${this._cachePath}, options=${inspectOptions(
      this.options as Record<string, unknown>,
    )}>`;
  }

  // Mirrors Rails FileStore#read_entry (file_store.rb:114-119): the payload
  // bytes come back from readSerializedEntry and only a real Entry is returned,
  // so a stray file in the cache directory degrades to a miss.
  protected readEntry(key: string, _options: StoreOptions): Entry | null {
    const payload = this.readSerializedEntry(key);
    if (payload != null) {
      const entry = this.deserializeEntry(payload);
      return entry instanceof Entry ? entry : null;
    }
    return null;
  }

  // Mirrors Rails FileStore#read_serialized_entry (file_store.rb:121-126): a
  // read failure is logged and treated as a miss.
  protected readSerializedEntry(key: string): string | null {
    try {
      return File.isExist(key) ? File.read(key) : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Store.logger?.error?.(`FileStoreError (${message}): ${message}`);
      return null;
    }
  }

  protected writeEntry(key: string, entry: Entry, options: StoreOptions = {}): boolean {
    return this.writeSerializedEntry(key, this.serializeEntry(entry, options) as string, options);
  }

  // Mirrors Rails FileStore#write_serialized_entry (file_store.rb:132-137):
  // unless_exist refuses the write when the file merely exists, regardless of
  // expiry. The payload lands through File.atomic_write, so a crash mid-write
  // leaves the previous file rather than a truncated one.
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
        // Just in case the error was caused by another process deleting the
        // file first (file_store.rb:145-147).
        if (File.isExist(key)) throw error;
        return false;
      }
    } else {
      return false;
    }
  }

  // Lock a file for a block so only one process can modify it at a time
  // (file_store.rb:140-153). An adapter without `flockSync` — Node's `fs`
  // exposes no flock — still opens and closes the file, and the block runs
  // unlocked, which is the missing-file arm's behaviour anyway.
  protected lockFile<T>(fileName: string, block: () => T): T {
    if (File.isExist(fileName)) {
      const f = getFs().openSync(fileName, "r+");
      try {
        getFs().flockSync?.(f, "ex");
        return block();
      } finally {
        try {
          getFs().flockSync?.(f, "un");
        } finally {
          getFs().closeSync(f);
        }
      }
    } else {
      return block();
    }
  }

  // Translate a key into a file path (file_store.rb:158-181).
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

    // Make sure file name doesn't exceed file system limits.
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

  // Translate a file path into a key (file_store.rb:184-187).
  /**
   * @missingRailsCall delete — PERMANENT: JS String#split's limit truncates the remainder
   *   where Ruby's keeps it joined, so `split(SEPARATOR,
   *   4).last.delete(SEPARATOR)` (file_store.rb:186) has no operand-for-operand
   *   TS form; the slice(3).join('') chain computes the same string.
   * @missingRailsCall last — PERMANENT: JS String#split's limit truncates the remainder
   *   where Ruby's keeps it joined, so `split(SEPARATOR,
   *   4).last.delete(SEPARATOR)` (file_store.rb:186) has no operand-for-operand
   *   TS form; the slice(3).join('') chain computes the same string.
   */
  protected filePathKey(path: string): string {
    const sep = File.SEPARATOR;
    // Ruby `split(File::SEPARATOR, 4).last.delete(File::SEPARATOR)`: the limit
    // keeps the remainder joined, which the delete then concatenates — JS'
    // split limit discards it instead, so slice off the first three fields.
    const fname = path.slice(this.cachePath.length).split(sep).slice(3).join("");
    return decodeWwwFormComponent(fname);
  }

  // Mirrors Rails delete_empty_directories (file_store.rb:190-197): after
  // unlinking the entry, recursively remove now-empty intermediate directories
  // up to — but never including — cachePath.
  private deleteEmptyDirectories(dir: string): void {
    if (File.realpath(dir) === File.realpath(this.cachePath)) return;
    let children: string[];
    try {
      children = Dir.children(dir);
    } catch {
      return;
    }
    if (isEmpty(children)) {
      // Rails: `Dir.delete(dir) rescue nil` — a failed delete is swallowed and
      // we still recurse toward the parent (file_store.rb:197-199).
      try {
        Dir.delete(dir);
      } catch {}
      this.deleteEmptyDirectories(File.dirname(dir));
    }
  }

  // Make sure a file path's directories exist (file_store.rb:200-202).
  protected ensureCachePath(path: string): void {
    if (!File.isExist(path)) FileUtils.makedirs(path);
  }

  // Mirrors Rails FileStore#search_dir (file_store.rb:204-214): depth-first walk
  // of the cache directory, yielding every file path.
  protected searchDir(dir: string, callback: (path: string) => void): void {
    if (!File.isExist(dir)) return;
    let children: string[];
    try {
      children = Dir.children(dir);
    } catch {
      return;
    }
    for (const d of children) {
      const name = File.join(dir, d);
      try {
        if (File.isDirectory(name)) {
          this.searchDir(name, callback);
        } else {
          callback(name);
        }
      } catch {}
    }
  }

  // Mirrors Rails FileStore#modify_value (file_store.rb:218-241): on a missing,
  // expired, or version-mismatched entry it *creates* the key set to amount
  // through the instrumented write path and returns amount (so
  // `increment("foo") # => 1`); on a hit it adds to entry.value.to_i, preserving
  // the entry's expiresAt/version.
  private modifyValue(name: string, amount: number, options: StoreOptions): number {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    const version = this.normalizeVersion(name, options) ?? null;
    // Rails coerces `amount = Integer(amount)` once (file_store.rb:226) and uses
    // it uniformly for the seed write, the return, and the hit-path addition;
    // `Integer()` raises on NaN/Infinity rather than silently truncating.
    amount = Integer(amount);

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

// Mirrors Ruby `#to_i`: Integer/Float truncate toward zero, a String yields its
// leading integer (0 when none), and anything else is 0.
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
