import {
  rbFArray,
  uniq,
  rbStrSend,
  rbEqual,
  Pathname,
  block as rbBlock,
  first,
  compact,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { Magic } from "./magic.js";
import { Marcel as MarcelSeat } from "./namespaces.js";
import { TYPE_EXTS, TYPE_PARENTS } from "./tables.js";

export class MimeType {
  static toString(): string {
    return "Marcel::MimeType";
  }

  static BINARY: unknown = "application/octet-stream";

  static extend(
    type: string,
    options: { extensions?: unknown; parents?: unknown; magic?: unknown } = {},
  ) {
    let { extensions = [], parents = [] } = options;
    const { magic = null } = options;
    extensions = uniq([...rbFArray(extensions), ...rbFArray(TYPE_EXTS[type])]);
    parents = uniq([...rbFArray(parents), ...rbFArray(TYPE_PARENTS[type])]);
    return Magic.add(type, { extensions: extensions, magic: magic, parents: parents });
  }

  static for(
    pathnameOrIo: unknown = null,
    options: { name?: unknown; extension?: unknown; declaredType?: unknown } = {},
  ) {
    let _t;
    const { name = null, extension = null, declaredType = null } = options;
    const filenameType =
      ((_t = this.forName(name)) ?? false) !== false ? _t : this.forExtension(extension);
    return this.mostSpecificType(
      this.forData(pathnameOrIo),
      this.forDeclaredType(declaredType),
      filenameType,
      MimeType.BINARY,
    );
  }

  static forData(pathnameOrIo: unknown) {
    if (pathnameOrIo != null && pathnameOrIo !== false) {
      return this.withIo(pathnameOrIo, (io) => {
        let magic;
        if (((magic = Magic.byMagic(io)) ?? false) !== false) {
          return rbStrSend(magic.type, "downcase")[0];
        }
        return null;
      });
    }
    return null;
  }

  static forName(name: unknown) {
    let magic;
    if (name != null && name !== false) {
      if (((magic = Magic.byPath(name)) ?? false) !== false) {
        return rbStrSend(magic.type, "downcase")[0];
      }
      return null;
    }
    return null;
  }

  static forExtension(extension: unknown) {
    let magic;
    if (extension != null && extension !== false) {
      if (((magic = Magic.byExtension(extension)) ?? false) !== false) {
        return rbStrSend(magic.type, "downcase")[0];
      }
      return null;
    }
    return null;
  }

  static forDeclaredType(declaredType: unknown) {
    const type = this.parseMediaType(declaredType);
    if (!rbEqual(type, MimeType.BINARY)) {
      return type;
    }
    return null;
  }

  static withIo(pathnameOrIo: unknown, block?: (...args: unknown[]) => unknown) {
    if (pathnameOrIo instanceof Pathname) {
      return pathnameOrIo.open(
        ...((block != null ? [rbBlock(block)] : []) as Parameters<typeof pathnameOrIo.open>),
      );
    } else {
      return block(pathnameOrIo);
    }
  }

  static parseMediaType(contentType: unknown) {
    let result;
    if (contentType != null && contentType !== false) {
      result = first(
        rbStrSend(
          rbStrSend(contentType, "downcase")[0] as string,
          "split",
          /[;,\s]/,
          2,
        )[0] as string[],
      );
      if (result != null && (rbStrSend(result, "index", "/")[0] ?? false) !== false) {
        return result;
      }
      return null;
    }
    return null;
  }

  static mostSpecificType(...candidates: unknown[]) {
    return ((x) =>
      x.length === 0
        ? null
        : x.reduce((type, candidate) => {
            if (Magic.isChild(candidate, type)) {
              return candidate;
            } else {
              return type;
            }
          }))(uniq(compact(candidates)));
  }
}
rbModConstSet(MarcelSeat, "MimeType", MimeType);
