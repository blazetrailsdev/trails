import {
  rbFArray,
  uniq,
  Pathname,
  block as rbBlock,
  compact,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { Magic, type MagicMatch } from "./magic.js";
import { Marcel as MarcelSeat } from "./namespaces.js";
import { TYPE_EXTS, TYPE_PARENTS } from "./tables.js";

export class MimeType {
  static BINARY = "application/octet-stream";

  static extend(
    type: string,
    {
      extensions = [],
      parents = [],
      magic = null,
    }: {
      extensions?: string | string[] | null;
      parents?: string | string[] | null;
      magic?: MagicMatch[] | null;
    } = {},
  ) {
    extensions = uniq([...rbFArray(extensions), ...rbFArray(TYPE_EXTS[type])] as string[]);
    parents = uniq([...rbFArray(parents), ...rbFArray(TYPE_PARENTS[type])] as string[]);
    return Magic.add(type, { extensions: extensions, magic: magic, parents: parents });
  }

  static for(
    pathnameOrIo: unknown = null,
    {
      name = null,
      extension = null,
      declaredType = null,
    }: { name?: string | null; extension?: string | null; declaredType?: string | null } = {},
  ) {
    const filenameType = this.forName(name) ?? this.forExtension(extension);
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
        if ((magic = Magic.byMagic(io))) {
          return magic.type.toLowerCase();
        }
        return null;
      });
    }
    return null;
  }

  static forName(name: string | null) {
    let magic;
    if (name != null) {
      if ((magic = Magic.byPath(name))) {
        return magic.type.toLowerCase();
      }
      return null;
    }
    return null;
  }

  static forExtension(extension: string | null) {
    let magic;
    if (extension != null) {
      if ((magic = Magic.byExtension(extension))) {
        return magic.type.toLowerCase();
      }
      return null;
    }
    return null;
  }

  static forDeclaredType(declaredType: string | null) {
    const type = this.parseMediaType(declaredType);
    if (type !== MimeType.BINARY) {
      return type;
    }
    return null;
  }

  static withIo<R>(pathnameOrIo: unknown, block: (io: unknown) => R): R {
    if (pathnameOrIo instanceof Pathname) {
      return pathnameOrIo.open(rbBlock(block)) as R;
    } else {
      return block(pathnameOrIo);
    }
  }

  static parseMediaType(contentType: string | null) {
    let result;
    if (contentType != null) {
      result = contentType.toLowerCase().split(/[;,\s]/, 2)[0];
      if (result != null && result.includes("/")) {
        return result;
      }
      return null;
    }
    return null;
  }

  static mostSpecificType(...candidates: (string | null)[]) {
    const x = uniq(compact(candidates));
    return x.length === 0
      ? null
      : x.reduce((type, candidate) => (Magic.isChild(candidate, type) ? candidate : type));
  }
}
rbModConstSet(MarcelSeat, "MimeType", MimeType);
