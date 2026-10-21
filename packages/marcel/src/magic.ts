import { TYPE_EXTS, TYPE_PARENTS, EXTENSIONS, MAGIC } from "./tables.js";
import {
  Pathname,
  compact,
  isEmpty,
  deleteIf,
  aryDeleteIf,
  rbObjAsString,
  Range,
  File,
  rbHash,
  rbObjRespondTo,
  StringIO,
  Encoding,
  encode,
  rbModConstSet,
  b,
  rbEqual,
  rbStrInclude,
} from "@blazetrails/ruby-compat";
import { Marcel as MarcelSeat } from "./namespaces.js";

export type MagicMatch = [number | Range<number>, string | Uint8Array | null, MagicMatch[]?];

interface MagicIO {
  read(length: number, buffer?: string | Uint8Array): string | Uint8Array | null;
  rewind(): unknown;
  binmode(): unknown;
  setEncoding(encoding: Encoding): unknown;
}

export class Magic {
  declare _type: string;
  declare _mediatype: string | undefined;
  declare _subtype: string | undefined;

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

  constructor(type: string) {
    this._type = type;
    const i = type.indexOf("/");
    [this._mediatype, this._subtype] = i < 0 ? [type] : [type.slice(0, i), type.slice(i + 1)];
  }

  static add(
    type: string,
    options: {
      extensions?: string | string[] | null;
      parents?: string | string[] | null;
      magic?: MagicMatch[] | null;
    },
  ) {
    const extensions = compact([options.extensions].flat());
    TYPE_EXTS[type] = extensions;
    const parents = compact([options.parents].flat());
    if (!isEmpty(parents)) {
      TYPE_PARENTS[type] = parents;
    }
    for (const ext of extensions) {
      EXTENSIONS[ext] = type;
    }
    if (options.magic) {
      MAGIC.unshift([type, options.magic]);
      return MAGIC;
    }
    return null;
  }

  static remove(type: string) {
    deleteIf(EXTENSIONS, (ext, t) => t === type);
    aryDeleteIf(MAGIC, ([t, _m]) => t === type);
    delete TYPE_EXTS[type];
    const parents = TYPE_PARENTS[type] ?? null;
    delete TYPE_PARENTS[type];
    return parents;
  }

  isText() {
    return this.mediatype === "text" || this.isChildOf("text/plain");
  }

  isImage() {
    return this.mediatype === "image";
  }

  isAudio() {
    return this.mediatype === "audio";
  }

  isVideo() {
    return this.mediatype === "video";
  }

  isChildOf(parent: string) {
    return (this.constructor as typeof Magic).isChild(this.type, parent);
  }

  extensions() {
    return TYPE_EXTS[this.type] ?? [];
  }

  comment() {
    return null;
  }

  static byExtension(ext: string) {
    ext = rbObjAsString(ext).toLowerCase();
    const mime = ext.slice(0, 1) === "." ? EXTENSIONS[ext.slice(1)] : EXTENSIONS[ext];
    return mime != null ? new this(mime) : null;
  }

  static byPath(path: string | Pathname) {
    return this.byExtension(File.extname(String(path)));
  }

  static byMagic(io: unknown) {
    const mime = this.magicMatch(io, "find") as [string, MagicMatch[]] | undefined;
    return mime ? new this(mime[0]) : null;
  }

  static allByMagic(io: unknown) {
    return (this.magicMatch(io, "select") as [string, MagicMatch[]][]).map(
      (mime) => new this(mime[0]),
    );
  }

  toString(): string {
    return this.type;
  }

  isEql(other: unknown) {
    return this.type === rbObjAsString(other);
  }

  hash() {
    return rbHash(this.type);
  }

  equals(other: unknown) {
    return this.isEql(other);
  }

  static isChild(child: string, parent: string): boolean | null {
    return child === parent || (TYPE_PARENTS[child]?.some((p) => this.isChild(p, parent)) ?? null);
  }

  static magicMatch(io: unknown, method: "find" | "select"): unknown {
    if (!rbObjRespondTo(io, "read")) {
      return this.magicMatch(new StringIO(rbObjAsString(io)), method);
    }
    const io_ = io as MagicIO;
    if (rbObjRespondTo(io_, "binmode")) {
      io_.binmode();
    }
    if (rbObjRespondTo(io_, "setEncoding")) {
      io_.setEncoding(Encoding.BINARY);
    }
    const buffer = encode("", Encoding.BINARY);
    const block = ([_type, matches]: [string, MagicMatch[]]) =>
      this.magicMatchIo(io_, matches, buffer);
    return method === "find" ? MAGIC.find(block) : MAGIC.filter(block);
  }

  static magicMatchIo(io: MagicIO, matches: MagicMatch[], buffer: string | Uint8Array): boolean {
    return matches.some(([offset, value, children]) => {
      let match: boolean | null = null;
      if (value != null) {
        if (offset instanceof Range) {
          io.read(offset.begin!, buffer);
          const x = io.read(offset.end! - offset.begin! + b(value).length, buffer);
          match = x != null && rbStrInclude(x, value);
        } else {
          io.read(offset, buffer);
          match = rbEqual(io.read(b(value).length, buffer), value);
        }
      }
      io.rewind();
      return !!match && (!children || this.magicMatchIo(io, children, buffer));
    });
  }
}
rbModConstSet(MarcelSeat, "Magic", Magic);
