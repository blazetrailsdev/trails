import { TYPE_EXTS, TYPE_PARENTS, EXTENSIONS, MAGIC } from "./tables.js";
import {
  Enumerator,
  Pathname,
  rbStrSend,
  rbCheckArrayType,
  compact,
  isEmpty,
  deleteIf,
  rbEqual,
  aryDelete,
  hashDelete,
  rbObjClass,
  rbObjAsString,
  Range,
  File,
  rbHash,
  rbObjRespondTo,
  StringIO,
  Encoding,
  encode,
  rbFSend,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { Marcel as MarcelSeat } from "./namespaces.js";

export class Magic {
  declare _type: unknown;
  declare _mediatype: unknown;
  declare _subtype: unknown;

  static toString(): string {
    return "Marcel::Magic";
  }

  get type() {
    return this._type;
  }

  get mediatype() {
    return this._mediatype ?? null;
  }

  get subtype() {
    return this._subtype ?? null;
  }

  constructor(type: unknown) {
    this._type = type;
    const values = ((x) => (x == null ? [] : (rbCheckArrayType(x) ?? [x])))(
      rbStrSend(type as string, "split", "/", 2)[0] as string[],
    );
    this._mediatype = values[0];
    this._subtype = values[1];
  }

  static add(
    type: string,
    options:
      | { extensions: string; parents: string }
      | { extensions: unknown; magic: unknown; parents: unknown },
  ) {
    const extensions = compact([options.extensions].flat(Infinity));
    TYPE_EXTS[type] = extensions;
    const parents = compact([options.parents].flat(Infinity));
    if (!isEmpty(parents)) {
      TYPE_PARENTS[type] = parents;
    }
    for (const ext of extensions) {
      EXTENSIONS[ext] = type;
    }
    if (options.magic != null && options.magic !== false) {
      return MAGIC.unshift([type, options.magic]);
    }
    return null;
  }

  static remove(type: string) {
    deleteIf(EXTENSIONS, (ext, t) => rbEqual(t, type));
    deleteIf(MAGIC, (t, _m) => rbEqual(t, type));
    hashDelete(TYPE_EXTS, type);
    return Array.isArray(TYPE_PARENTS)
      ? aryDelete(TYPE_PARENTS, type)
      : hashDelete(TYPE_PARENTS, type);
  }

  isText() {
    return rbEqual(this.mediatype, "text") || this.isChildOf("text/plain");
  }

  isImage() {
    return rbEqual(this.mediatype, "image");
  }

  isAudio() {
    return rbEqual(this.mediatype, "audio");
  }

  isVideo() {
    return rbEqual(this.mediatype, "video");
  }

  isChildOf(parent: string) {
    return (rbObjClass(this) as unknown as typeof Magic).isChild(this.type, parent);
  }

  extensions() {
    return TYPE_EXTS[this.type] ?? [];
  }

  comment() {
    return null;
  }

  static byExtension(ext: string) {
    ext = rbStrSend(rbObjAsString(ext), "downcase")[0] as string;
    const mime =
      rbStrSend(ext, "get", new Range(0, 0, false))[0] === "."
        ? EXTENSIONS[rbStrSend(ext, "get", new Range(1, -1, false))[0]]
        : EXTENSIONS[ext];
    return mime != null && mime !== false ? new this(mime) : mime;
  }

  static byPath(path: string | Pathname) {
    return this.byExtension(File.extname(path));
  }

  static byMagic(io: unknown) {
    const mime = this.magicMatch(io, "find");
    return mime != null && mime !== false ? new this(mime[0]) : mime;
  }

  static allByMagic(io: unknown) {
    return ((x) =>
      x instanceof globalThis.Set || x instanceof globalThis.Map || x instanceof Enumerator
        ? [...x]
        : Object.getPrototypeOf(x) === Object.prototype
          ? Object.entries(x as object)
          : (x as unknown[]))(this.magicMatch(io, "select")).map((mime) => new this(mime[0]));
  }

  toString(): string {
    return this.type;
  }

  isEql(other: unknown) {
    return rbEqual(this.type, rbObjAsString(other));
  }

  hash() {
    return rbHash(this.type);
  }

  equals(other: unknown) {
    return this.isEql(other);
  }

  static isChild(child: unknown, parent: string) {
    return (
      rbEqual(child, parent) ||
      ((x) =>
        x == null
          ? x
          : x instanceof globalThis.Set || x instanceof globalThis.Map || x instanceof Enumerator
            ? [...x]
            : Object.getPrototypeOf(x) === Object.prototype
              ? Object.entries(x as object)
              : (x as unknown[]))(TYPE_PARENTS[child])?.some((p: unknown) =>
        this.isChild(p, parent),
      )
    );
  }

  static magicMatch(io: unknown, method: string): unknown {
    if (!rbObjRespondTo(io, "read")) {
      return this.magicMatch(new StringIO(rbObjAsString(io)), method);
    }
    if (rbObjRespondTo(io, "binmode")) {
      io.binmode();
    }
    if (rbObjRespondTo(io, "setEncoding")) {
      io.setEncoding(Encoding.BINARY);
    }
    const buffer = encode("", Encoding.BINARY);
    return rbFSend(MAGIC, method, (x: unknown) =>
      ((type?: unknown, matches?: unknown) => this.magicMatchIo(io, matches, buffer))(
        ...(Array.isArray(x) ? x : [x]),
      ),
    );
  }

  static magicMatchIo(
    io: unknown,
    matches: unknown,
    buffer: string | Uint8Array<ArrayBufferLike>,
  ): unknown {
    return (
      matches instanceof globalThis.Map
        ? [...matches]
        : Array.isArray(matches)
          ? matches
          : Object.entries(matches ?? {})
    ).some(([offset, value, children]): unknown => {
      let x;
      const match = (() => {
        if (value != null && value !== false) {
          if (offset instanceof Range) {
            io.read(offset.begin, buffer);
            x = io.read(
              (offset.end as number) -
                (offset.begin as number) +
                (rbStrSend(value, "bytesize")[0] as number),
              buffer,
            );
            return x != null && x !== false
              ? (x instanceof globalThis.Set ||
                x instanceof globalThis.Map ||
                x instanceof Enumerator
                  ? [...x]
                  : Object.getPrototypeOf(x) === Object.prototype
                    ? Object.entries(x as object)
                    : (x as unknown[])
                ).includes(value)
              : x;
          } else {
            io.read(offset, buffer);
            return rbEqual(io.read(rbStrSend(value, "bytesize")[0], buffer), value);
          }
        }
        return null;
      })();
      io.rewind();
      return match != null && match !== false
        ? !(children != null && children !== false) || this.magicMatchIo(io, children, buffer)
        : match;
    });
  }
}
rbModConstSet(MarcelSeat, "Magic", Magic);
