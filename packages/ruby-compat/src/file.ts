import { getFs, getPath } from "./fs-adapter.js";

/**
 * `File` (`vendor/ruby/file.c:7354` `rb_cFile`), the sliver of it trails calls.
 *
 * Rails reaches the filesystem through this class — `File.exist?(key)` in
 * `vendor/rails/activesupport/lib/active_support/cache/file_store.rb:125`,
 * `File.join(cache_path, ...)` at `file_store.rb:185`,
 * `File.realpath(dir)` at `file_store.rb:196` — so trails reaches it through a
 * class of the same name rather than through members named after node's `fs`.
 * The backend a member lands on is the `FsAdapter` contract in
 * `./fs-adapter.js`; a platform registers one, and nothing here names a
 * runtime.
 *
 * Only the members ported bodies call are here. `File::SEPARATOR` is `"/"` on
 * every platform (`vendor/ruby/file.c:7427`); the backslash is
 * `File::ALT_SEPARATOR`, which trails has no call site for.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `File` (`vendor/ruby/file.c:7354`),
 * which Rails calls without defining, so no Rails or gem file declares the
 * class this file's single export lives in.
 */
export class File {
  /**
   * `vendor/ruby/file.c:7427` — `File::SEPARATOR`, `"/"` on every platform.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File::SEPARATOR`.
   */
  static readonly SEPARATOR = "/";

  /**
   * `vendor/ruby/file.c:1806` `rb_file_exist_p`, which is `rb_stat(fname)`
   * against a FOLLOWED symlink — so a broken symlink is `false` even though
   * `File.symlink?` is `true`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.exist?`
   * (`vendor/ruby/file.c:1806`).
   */
  static isExist(fileName: string): boolean {
    return getFs().existsSync(fileName);
  }

  /**
   * `vendor/ruby/file.c:1615` `rb_file_directory_p`, which answers `false`
   * rather than raising when the stat fails (`file.c:1622`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.directory?`
   * (`vendor/ruby/file.c:1615`).
   */
  static isDirectory(fileName: string): boolean {
    try {
      return getFs().statSync(fileName).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * `vendor/ruby/file.c:2009` `rb_file_file_p`, `false` on a failed stat.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.file?`
   * (`vendor/ruby/file.c:2009`).
   */
  static isFile(fileName: string): boolean {
    try {
      return getFs().statSync(fileName).isFile();
    } catch {
      return false;
    }
  }

  /**
   * `vendor/ruby/io.c:12200` `rb_io_s_read`, in its whole-file form.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.read` (`IO.read`,
   * `vendor/ruby/io.c:12200`).
   */
  static read(name: string): string {
    return getFs().readFileSync(name, "utf-8");
  }

  /**
   * `vendor/ruby/io.c:12242` `rb_io_s_binread`, which answers an ASCII-8BIT
   * String — the file's BYTES. A JS string has no ASCII-8BIT encoding to be
   * in, so the bytes come back decoded with the encoding `File.write` put them
   * in, which is what makes the pair round-trip; only a caller that treats the
   * result as a byte sequence rather than as text can tell the difference, and
   * trails has none.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.binread` (`IO.binread`,
   * `vendor/ruby/io.c:12242`).
   */
  static binread(name: string): string {
    return getFs().readFileSync(name, "utf-8");
  }

  /**
   * `vendor/ruby/io.c:12377` `rb_io_s_write`, which answers the number of
   * BYTES written rather than the string itself.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.write` (`IO.write`,
   * `vendor/ruby/io.c:12377`).
   */
  static write(name: string, string: string): number {
    getFs().writeFileSync(name, string);
    return new TextEncoder().encode(string).length;
  }

  /**
   * `vendor/ruby/file.c:3202` `rb_file_s_unlink`, which answers the number of
   * files deleted and raises on the first failure.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.delete`
   * (`vendor/ruby/file.c:3202`).
   */
  static delete(...files: string[]): number {
    for (const file of files) getFs().unlinkSync(file);
    return files.length;
  }

  /**
   * `vendor/ruby/file.c:4559` `rb_file_s_realpath`, which resolves every
   * symlink and raises `ENOENT` when the path does not exist. A backend with
   * no symlink support has no `realpathSync`, and there the path resolves
   * lexically.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.realpath`
   * (`vendor/ruby/file.c:4559`).
   */
  static realpath(pathname: string): string {
    const fs = getFs();
    if (fs.realpathSync) return fs.realpathSync(pathname);
    return File.expandPath(pathname);
  }

  /**
   * `vendor/ruby/file.c:5013` `rb_file_join`, which is a STRING join and not
   * a path normalization: `File.join("a", "..", "b")` is `"a/../b"`, where
   * node's `path.join` answers `"b"`. A separator at the boundary is squeezed
   * to one (`file.c:5061-5067`) — `File.join("a//", "/b")` is `"a/b"` — and an
   * empty component keeps its separator, so `File.join("a", "")` is `"a/"`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.join`
   * (`vendor/ruby/file.c:5013`).
   */
  static join(...args: string[]): string {
    if (args.length === 0) return "";
    let result = args[0];
    for (const tmp of args.slice(1)) {
      const tail = result.replace(/\/+$/, "");
      if (tmp.startsWith(File.SEPARATOR)) result = `${tail}${tmp}`;
      else if (tail.length === result.length) result = `${result}${File.SEPARATOR}${tmp}`;
      else result = `${result}${tmp}`;
    }
    return result;
  }

  /**
   * `vendor/ruby/file.c:4770` `rb_file_s_dirname`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.dirname`
   * (`vendor/ruby/file.c:4770`).
   */
  static dirname(fileName: string): string {
    return getPath().dirname(fileName);
  }

  /**
   * `vendor/ruby/file.c:4705` `rb_file_s_basename`. The optional `suffix` is
   * stripped, and the literal `".*"` strips whatever extension is there
   * (`file.c:4664-4680`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.basename`
   * (`vendor/ruby/file.c:4705`).
   */
  static basename(fileName: string, suffix?: string): string {
    const base = getPath().basename(fileName);
    if (suffix === undefined) return base;
    if (suffix === ".*") {
      const extname = File.extname(base);
      return extname === "" ? base : base.slice(0, base.length - extname.length);
    }
    return base.endsWith(suffix) && base !== suffix
      ? base.slice(0, base.length - suffix.length)
      : base;
  }

  /**
   * `vendor/ruby/file.c:4954` `rb_file_s_extname`: a leading dot is not an
   * extension (`".bashrc"` is `""`) and a trailing dot is (`"b."` is `"."`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.extname`
   * (`vendor/ruby/file.c:4954`).
   */
  static extname(fileName: string): string {
    return getPath().extname(fileName);
  }

  /**
   * `vendor/ruby/file.c:4126` `rb_file_s_expand_path`, which resolves
   * `fileName` against `dirString` — the working directory when it is omitted.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.expand_path`
   * (`vendor/ruby/file.c:4126`).
   */
  static expandPath(fileName: string, dirString?: string): string {
    return getPath().resolve(dirString ?? getFs().cwd(), fileName);
  }

  /**
   * `vendor/ruby/file.c:4210` `rb_file_s_absolute_path_p`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.absolute_path?`
   * (`vendor/ruby/file.c:4210`).
   */
  static isAbsolutePath(fileName: string): boolean {
    return getPath().isAbsolute?.(fileName) ?? fileName.startsWith(File.SEPARATOR);
  }
}
