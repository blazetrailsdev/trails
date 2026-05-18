/**
 * ActionView::TemplatePath
 *
 * Represents a template path within ActionView's lookup and rendering system,
 * like "users/show".
 *
 * Converts between separate (name, prefix, partial) arguments and the virtual
 * path string form.
 */
export class TemplatePath {
  readonly name: string;
  readonly prefix: string;
  readonly partial: boolean;
  readonly virtual: string;

  constructor(name: string, prefix: string, partial: boolean, virtual: string) {
    this.name = name;
    this.prefix = prefix;
    this.partial = partial;
    this.virtual = virtual;
  }

  /** Convert name, prefix, and partial into a virtual path string. */
  static virtual(name: string, prefix: string, partial: boolean): string {
    if (prefix === "") {
      return `${partial ? "_" : ""}${name}`;
    }
    if (partial) {
      return `${prefix}/_${name}`;
    }
    return `${prefix}/${name}`;
  }

  /** Build a TemplatePath from a virtual path. */
  static parse(virtual: string): TemplatePath {
    const nameidx = virtual.lastIndexOf("/");
    let prefix: string;
    let name: string;
    if (nameidx >= 0) {
      prefix = virtual.slice(0, nameidx);
      name = virtual.slice(nameidx + 1);
      if (prefix.startsWith("/")) prefix = prefix.slice(1);
    } else {
      prefix = "";
      name = virtual;
    }
    const partial = name.startsWith("_");
    if (partial) name = name.slice(1);
    return new TemplatePath(name, prefix, partial, virtual);
  }

  /** Convert name, prefix, and partial into a TemplatePath. */
  static build(name: string, prefix: string, partial: boolean): TemplatePath {
    return new TemplatePath(name, prefix, partial, TemplatePath.virtual(name, prefix, partial));
  }

  /** @internal */
  isPartial(): boolean {
    return this.partial;
  }

  /** @internal */
  virtualPath(): string {
    return this.virtual;
  }

  toString(): string {
    return this.virtual;
  }

  /**
   * @internal
   * String hash code used by `LookupContext`'s details-cache keying. Mirrors
   * Ruby `Object#hash` for `TemplatePath` (delegates to the virtual path).
   */
  hash(): number {
    let h = 0;
    for (let i = 0; i < this.virtual.length; i++) {
      h = ((h << 5) - h + this.virtual.charCodeAt(i)) | 0;
    }
    return h;
  }

  /** @internal */
  eql(other: TemplatePath): boolean {
    return this.virtual === other.virtual;
  }

  equals(other: TemplatePath): boolean {
    return this.eql(other);
  }
}
