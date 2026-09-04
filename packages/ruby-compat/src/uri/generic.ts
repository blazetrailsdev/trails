import { b } from "../string/b.js";
import { BadURIError, InvalidComponentError, InvalidURIError, RFC3986_PARSER } from "./common.js";
import type { RFC3986Parser } from "./rfc3986-parser.js";

/**
 * `URI::Generic` (`vendor/ruby/lib/uri/generic.rb:21`), the base class of every
 * scheme class and what `URI.parse` answers for a scheme it does not know.
 * Only the members trails sends are ported: the component readers and their
 * mutable setters, `merge` and the private helpers it reaches through. The
 * unsent ones are not, and the list is exhaustive: `build` / `build2`
 * (`generic.rb:78,116`), `COMPONENT` / `component` (`generic.rb:46,313`),
 * `registry` and its `check_` / `set_` / `=` trio
 * (`generic.rb:252,750,755,760`), `opaque` and `opaque=`
 * (`generic.rb:277,916`), `check_userinfo` / `check_user` / `check_password`
 * and the `userinfo=` / `user=` / `password=` setters
 * (`generic.rb:375,393,417,441,471,498`), `set_user` / `set_password`
 * (`generic.rb:524,534`), `escape_userpass` (`generic.rb:551`), `user` /
 * `password` (`generic.rb:568,573`), `decoded_user` / `decoded_password`
 * (`generic.rb:584,589`), `hostname` / `hostname=` (`generic.rb:668,685`),
 * `hierarchical?` (`generic.rb:976`), `relative?` (`generic.rb:999`),
 * `merge!` (`generic.rb:1096`), `route_from_path` / `route_from0` /
 * `route_from` / `route_to` (`generic.rb:1167,1206,1274,1314`), `normalize` /
 * `normalize!` (`generic.rb:1331,1340`), `==` / `hash` / `eql?` /
 * `component_ary` (`generic.rb:1396,1404,1408,1428`), `select`
 * (`generic.rb:1452`), `inspect` (`generic.rb:1463`), `coerce`
 * (`generic.rb:1486`), `replace!` (`generic.rb:299`), and `find_proxy` /
 * `use_proxy?` (`generic.rb:1512,1578`).
 *
 * `initialize`'s `arg_check` branch (`generic.rb:190-198`) is not ported with
 * it: its only callers are `build` / `build2` (`generic.rb:78,116`), which are
 * not ported either, and it runs through five `check_*` privates no other
 * ported body reaches.
 *
 * `parser` defaults to {@link RFC3986_PARSER} rather than MRI's
 * `DEFAULT_PARSER` (`generic.rb:174`), which is the RFC 2396 parser: only that
 * parser's `escape` is ported, so it carries none of the `regexp` table the
 * `check*` methods below read, and the RFC 3986 parser is the one every URI
 * `URI.parse` builds already holds (`rfc3986_parser.rb:131`).
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::Generic`
 * (`vendor/ruby/lib/uri/generic.rb:21`) ships with the interpreter.
 */
export class Generic {
  /** `DEFAULT_PORT` (`vendor/ruby/lib/uri/generic.rb:27`). */
  static readonly DEFAULT_PORT: number | null = null;

  /** `self.default_port` (`vendor/ruby/lib/uri/generic.rb:32`). */
  static get defaultPort(): number | null {
    return this.DEFAULT_PORT;
  }

  /** `default_port` (`vendor/ruby/lib/uri/generic.rb:39`). */
  get defaultPort(): number | null {
    return (this.constructor as typeof Generic).defaultPort;
  }

  protected _scheme: string | null = null;
  protected _user: string | null = null;
  protected _password: string | null = null;
  protected _host: string | null = null;
  protected _port: number | null = null;
  protected _path: string | null = null;
  protected _query: string | null = null;
  protected _opaque: string | null = null;
  protected _fragment: string | null = null;
  protected _parser: RFC3986Parser | null;

  /** `initialize` (`vendor/ruby/lib/uri/generic.rb:169`). */
  constructor(
    scheme: string | null,
    userinfo: string | null,
    host: string | null,
    port: string | number | null,
    registry: string | null,
    path: string | null,
    opaque: string | null,
    query: string | null,
    fragment: string | null,
    parser: RFC3986Parser = RFC3986_PARSER,
  ) {
    this._parser = parser === RFC3986_PARSER ? null : parser;

    this.setScheme(scheme);
    this.setHost(host);
    this.setPort(port);
    this.setUserinfo(userinfo);
    this.setPath(path);
    this.query = query;
    this.setOpaque(opaque);
    this.fragment = fragment;

    if (registry != null) {
      throw new InvalidURIError(
        `the scheme ${this._scheme} does not accept registry part: ${registry} (or bad hostname?)`,
      );
    }

    if (this._path == null && this._opaque == null) this.setPath("");
    if (this.defaultPort != null && this._port == null) this.setPort(this.defaultPort);
  }

  /** `scheme` (`vendor/ruby/lib/uri/generic.rb:221`). */
  get scheme(): string | null {
    return this._scheme;
  }

  /** `host` (`vendor/ruby/lib/uri/generic.rb:243`). */
  get host(): string | null {
    return this._host;
  }

  /** `port` (`vendor/ruby/lib/uri/generic.rb:250`). */
  get port(): number | null {
    return this._port;
  }

  /** `path` (`vendor/ruby/lib/uri/generic.rb:260`). */
  get path(): string | null {
    return this._path;
  }

  /** `query` (`vendor/ruby/lib/uri/generic.rb:266`). */
  get query(): string | null {
    return this._query;
  }

  /**
   * `fragment` (`vendor/ruby/lib/uri/generic.rb:283`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
   * `URI::Generic#fragment` (`vendor/ruby/lib/uri/generic.rb:283`).
   */
  get fragment(): string | null {
    return this._fragment;
  }

  /** `parser` (`vendor/ruby/lib/uri/generic.rb:289`). */
  get parser(): RFC3986Parser {
    return this._parser ?? RFC3986_PARSER;
  }

  /** `check_scheme` (`vendor/ruby/lib/uri/generic.rb:320`). */
  private checkScheme(v: string | null): boolean {
    if (v != null && !this.parser.regexp.SCHEME.test(v)) {
      throw new InvalidComponentError(`bad component(expected scheme component): ${v}`);
    }

    return true;
  }

  /** `set_scheme` (`vendor/ruby/lib/uri/generic.rb:334`). */
  protected setScheme(v: string | null): void {
    this._scheme = v?.toLowerCase() ?? null;
  }

  /** `scheme=` (`vendor/ruby/lib/uri/generic.rb:360`). */
  set scheme(v: string | null) {
    this.checkScheme(v);
    this.setScheme(v);
  }

  /** `set_userinfo` (`vendor/ruby/lib/uri/generic.rb:509`). */
  protected setUserinfo(
    user: string | null,
    password: string | null = null,
  ): [string | null, string | null] {
    if (password == null) {
      [user, password] = this.splitUserinfo(user);
    }
    this._user = user;
    this._password = password;

    return [this._user, this._password];
  }

  /** `split_userinfo` (`vendor/ruby/lib/uri/generic.rb:542`). */
  private splitUserinfo(ui: string | null): [string | null, string | null] {
    if (ui == null) return [null, null];
    const i = ui.indexOf(":");
    const [user, password] = i < 0 ? [ui, undefined] : [ui.slice(0, i), ui.slice(i + 1)];

    return [user, password ?? null];
  }

  /**
   * `userinfo` (`vendor/ruby/lib/uri/generic.rb:557`) — `user`, or
   * `user:password` where both are set.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
   * `URI::Generic#userinfo` (`vendor/ruby/lib/uri/generic.rb:557`).
   */
  get userinfo(): string | null {
    if (this._user == null) {
      return null;
    } else if (this._password == null) {
      return this._user;
    } else {
      return this._user + ":" + this._password;
    }
  }

  /** `authority` (`vendor/ruby/lib/uri/generic.rb:579`) — the array of user,
   *  password, host and port, or `nil` when none of them is set. */
  get authority(): [string | null, string | null, string | null, number | null] | null {
    if (this._user != null || this._password != null || this._host != null || this._port != null) {
      return [this._user, this._password, this._host, this._port];
    }
    return null;
  }

  /** `check_host` (`vendor/ruby/lib/uri/generic.rb:600`). */
  private checkHost(v: string | null): boolean | null {
    if (v == null) return v;

    if (this._opaque != null) {
      throw new InvalidURIError("can not set host with registry or opaque");
    } else if (!this.parser.regexp.HOST.test(v)) {
      throw new InvalidComponentError(`bad component(expected host component): ${v}`);
    }

    return true;
  }

  /** `set_host` (`vendor/ruby/lib/uri/generic.rb:619`). */
  protected setHost(v: string | null): void {
    this._host = v;
  }

  /** `set_authority` (`vendor/ruby/lib/uri/generic.rb:626`). */
  protected setAuthority(
    user: string | null,
    password: string | null,
    host: string | null,
    port: number | null = null,
  ): void {
    [this._user, this._password, this._host, this._port] = [
      user,
      password,
      host,
      port ?? this.defaultPort,
    ];
  }

  /** `host=` (`vendor/ruby/lib/uri/generic.rb:652`). */
  set host(v: string | null) {
    this.checkHost(v);
    this.setHost(v);
    this.setUserinfo(null);
  }

  /** `check_port` (`vendor/ruby/lib/uri/generic.rb:697`). */
  private checkPort(v: string | number | null): boolean | null {
    if (v == null) return v;

    if (this._opaque != null) {
      throw new InvalidURIError("can not set port with registry or opaque");
    } else if (typeof v !== "number" && !this.parser.regexp.PORT.test(v)) {
      throw new InvalidComponentError(
        `bad component(expected port component): ${JSON.stringify(v)}`,
      );
    }

    return true;
  }

  /**
   * `set_port` (`vendor/ruby/lib/uri/generic.rb:716`).
   *
   * The conversion is `String#to_i` (`rb_str_to_i`,
   * `vendor/ruby/string.c:6602`), which answers `0` for a string with no
   * leading digit run — `regexp[:PORT]` admits one made only of whitespace —
   * where `parseInt` would answer `NaN`.
   */
  protected setPort(v: string | number | null): void {
    if (v != null && typeof v !== "number") {
      v = v === "" ? null : Number(/^\s*[+-]?\d+/.exec(v)?.[0] ?? 0);
    }
    this._port = v;
  }

  /** `port=` (`vendor/ruby/lib/uri/generic.rb:743`). */
  set port(v: string | number | null) {
    this.checkPort(v);
    this.setPort(v);
    this.setUserinfo(null);
  }

  /** `check_path` (`vendor/ruby/lib/uri/generic.rb:772`). */
  private checkPath(v: string | null): boolean {
    if (v != null && this._opaque != null) {
      throw new InvalidURIError("path conflicts with opaque");
    }

    if (this._scheme != null && this._scheme !== "ftp") {
      if (v != null && v !== "" && !this.parser.regexp.ABS_PATH.test(v)) {
        throw new InvalidComponentError(`bad component(expected absolute path component): ${v}`);
      }
    } else {
      if (
        v != null &&
        v !== "" &&
        !this.parser.regexp.ABS_PATH.test(v) &&
        !this.parser.regexp.REL_PATH.test(v)
      ) {
        throw new InvalidComponentError(`bad component(expected relative path component): ${v}`);
      }
    }

    return true;
  }

  /** `set_path` (`vendor/ruby/lib/uri/generic.rb:804`). */
  protected setPath(v: string | null): void {
    this._path = v;
  }

  /** `path=` (`vendor/ruby/lib/uri/generic.rb:830`). */
  set path(v: string | null) {
    this.checkPath(v);
    this.setPath(v);
  }

  /** `query=` (`vendor/ruby/lib/uri/generic.rb:854`). */
  set query(v: string | null) {
    if (v == null) {
      this._query = null;
      return;
    }
    if (this._opaque != null) throw new InvalidURIError("query conflicts with opaque");

    v = v.replace(/[\t\r\n]/g, "");
    const invalid = /(%[^0-9a-fA-F][^0-9a-fA-F])/.exec(v);
    if (invalid) throw new InvalidURIError(`invalid percent escape: ${invalid[1]}`);
    this._query = v.replace(/(?!%[0-9a-fA-F]{2}|[!$-&(-;=?-_a-~])[\s\S]/g, (c) => {
      let out = "";
      for (const byte of b(c)) {
        out += `%${byte.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
      }
      return out;
    });
  }

  /** `set_opaque` (`vendor/ruby/lib/uri/generic.rb:898`). */
  protected setOpaque(v: string | null): void {
    this._opaque = v;
  }

  /** `fragment=` (`vendor/ruby/lib/uri/generic.rb:944`). */
  set fragment(v: string | null) {
    if (v == null) {
      this._fragment = null;
      return;
    }

    v = v.replace(/[\t\r\n]/g, "");
    this._fragment = v.replace(/(?!%[0-9a-fA-F]{2}|[!-~])[\s\S]/g, (c) => {
      let out = "";
      for (const byte of b(c)) {
        out += `%${byte.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
      }
      return out;
    });
  }

  /**
   * `absolute?` (`vendor/ruby/lib/uri/generic.rb:987`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
   * `URI::Generic#absolute?` (`vendor/ruby/lib/uri/generic.rb:987`).
   */
  isAbsolute(): boolean {
    if (this._scheme != null) {
      return true;
    } else {
      return false;
    }
  }

  /** `split_path` (`vendor/ruby/lib/uri/generic.rb:1006`) — Ruby's
   *  `String#split("/", -1)` keeps trailing empties and answers `[]` for `""`,
   *  neither of which JS's `String#split` does. */
  private splitPath(path: string): string[] {
    return path === "" ? [] : path.split("/");
  }

  /** `merge_path` (`vendor/ruby/lib/uri/generic.rb:1015`). */
  private mergePath(base: string, rel: string): string {
    const basePath = this.splitPath(base);
    const relPath = this.splitPath(rel);

    if (basePath[basePath.length - 1] === "..") basePath.push("");
    let i: number;
    while ((i = basePath.indexOf("..")) >= 0) {
      basePath.splice(i - 1, 2);
    }

    const first = relPath[0];
    if (first != null && first === "") {
      basePath.length = 0;
      relPath.shift();
    }

    const last = relPath[relPath.length - 1];
    if (last === "." || last === "..") relPath.push("");
    for (let j = relPath.length - 1; j >= 0; j--) {
      if (relPath[j] === ".") relPath.splice(j, 1);
    }

    const tmp: string[] = [];
    for (const x of relPath) {
      if (x === ".." && !(tmp.length === 0 || tmp[tmp.length - 1] === "..")) {
        tmp.pop();
      } else {
        tmp.push(x);
      }
    }

    let addTrailerSlash = tmp.length > 0;
    if (basePath.length === 0) {
      basePath.push("");
    } else if (addTrailerSlash) {
      basePath.pop();
    }
    let x: string | undefined;
    while ((x = tmp.shift()) !== undefined) {
      if (x === "..") {
        if (basePath.length > 1) basePath.pop();
      } else {
        basePath.push(x);
        for (const t of tmp) basePath.push(t);
        addTrailerSlash = false;
        break;
      }
    }
    if (addTrailerSlash) basePath.push("");

    return basePath.join("/");
  }

  /** `merge` / `+` (`vendor/ruby/lib/uri/generic.rb:1124`). */
  merge(oth: Generic | string): Generic {
    const rel = this.parser.convertToUri(oth);

    if (rel.isAbsolute()) {
      return rel;
    }

    if (!this.isAbsolute()) {
      throw new BadURIError("both URI are relative");
    }

    const base = this.dup();

    const authority = rel.authority;

    if ((rel.path == null || rel.path === "") && authority == null && rel.query == null) {
      if (rel.fragment != null) base.fragment = rel.fragment;
      return base;
    }

    base.query = null;
    base.fragment = null;

    if (authority != null) {
      base.setAuthority(...authority);
      base.setPath(rel.path);
    } else if (base.path != null && rel.path != null) {
      base.setPath(this.mergePath(base.path, rel.path));
    }

    if (rel.query != null) base.query = rel.query;
    if (rel.fragment != null) base.fragment = rel.fragment;

    return base;
  }

  /** `Object#dup` (`vendor/ruby/object.c:2205`) of a URI — the shallow copy
   *  `merge` mutates in place (`generic.rb:1140`). */
  protected dup(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this) as object), this) as this;
  }

  /** `to_s` (`vendor/ruby/lib/uri/generic.rb:1355`). */
  toString(): string {
    let str = "";
    if (this._scheme != null) {
      str += this._scheme;
      str += ":";
    }

    if (this._opaque != null) {
      str += this._opaque;
    } else {
      if (this._host != null || ["file", "postgres"].includes(this._scheme!)) {
        str += "//";
      }
      if (this.userinfo != null) {
        str += this.userinfo;
        str += "@";
      }
      if (this._host != null) {
        str += this._host;
      }
      if (this._port != null && this._port !== this.defaultPort) {
        str += ":";
        str += String(this._port);
      }
      str += this._path;
      if (this._query != null) {
        str += "?";
        str += this._query;
      }
    }
    if (this._fragment != null) {
      str += "#";
      str += this._fragment;
    }
    return str;
  }
}
