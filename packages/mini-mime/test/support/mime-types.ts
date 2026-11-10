import { File } from "@blazetrails/ruby-compat";

const __FILE__ = decodeURIComponent(new URL(import.meta.url).pathname);

const JSON_PATH = File.expandPath(
  "../../../../../vendor/mime-types-data/v3.2023.0808/data/mime-types.json",
  __FILE__,
);

interface Coder {
  "content-type": string;
  extensions?: string[];
  obsolete?: boolean;
  registered?: boolean;
  "use-instead"?: string;
}

export class Type {
  static readonly MEDIA_TYPE_RE = /([-\w.+]+)\/([-\w.+]*)/;

  contentType!: string;
  simplified!: string;
  obsolete = false;
  registered = false;
  private _extensions = new Set<string>();
  private _useInstead: string | null = null;

  constructor(coder: Coder) {
    this.setContentType(coder["content-type"]);
    this._extensions = new Set(coder.extensions ?? []);
    this.obsolete = coder.obsolete ?? false;
    this.registered = coder.registered ?? false;
    this._useInstead = coder["use-instead"] ?? null;
  }

  setContentType(typeString: string): void {
    const match = Type.MEDIA_TYPE_RE.exec(typeString);
    if (match == null) throw new Error(`Invalid Content-Type ${JSON.stringify(typeString)}`);
    this.contentType = typeString;
    this.simplified = Type.simplified(match);
  }

  static simplified(matchdata: RegExpExecArray): string {
    return matchdata
      .slice(1)
      .map((e) => e.toLowerCase())
      .join("/");
  }

  get extensions(): string[] {
    return [...this._extensions];
  }

  isObsolete(): boolean {
    return this.obsolete;
  }

  isRegistered(): boolean {
    return this.registered;
  }

  isComplete(): boolean {
    return this._extensions.size !== 0;
  }

  get useInstead(): string | null {
    return this.isObsolete() ? this._useInstead : null;
  }

  priorityCompare(other: Type): number {
    let pc = spaceship(this.simplified, other.simplified);
    if (pc === 0 || this.extensions.some((e) => other.extensions.includes(e))) {
      let reg, comp, obs, ui, oui;
      if ((reg = this.isRegistered()) !== other.isRegistered()) {
        pc = reg ? -1 : 1;
      } else if ((comp = this.isComplete()) !== other.isComplete()) {
        pc = comp ? -1 : 1;
      } else if ((obs = this.isObsolete()) !== other.isObsolete()) {
        pc = obs ? 1 : -1;
      } else if (obs && (ui = this.useInstead) !== (oui = other.useInstead)) {
        if (ui == null) pc = 1;
        else if (oui == null) pc = -1;
        else pc = spaceship(ui, oui);
      } else {
        pc = 0;
      }
    }
    return pc;
  }
}

function spaceship(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class Types {
  private static __types__: Types | null = null;

  private typeVariants = new Map<string, Map<string, Type>>();
  private extensionIndex = new Map<string, Map<string, Type>>();

  static async loadDefaultMimeTypes(): Promise<Types> {
    const types = new Types();
    for (const coder of JSON.parse(await File.readAsync(JSON_PATH)) as Coder[]) {
      types.addType(new Type(coder));
    }
    return (this.__types__ = types);
  }

  static each(block: (t: Type) => void): void {
    this.__types__!.each(block);
  }

  static typeFor(filename: string): Type[] {
    return this.__types__!.typeFor(filename);
  }

  each(block: (t: Type) => void): void {
    for (const tv of this.typeVariants.values()) for (const t of tv.values()) block(t);
  }

  typeFor(filename: string): Type[] {
    const ext = /\.?([^.]*?)$/.exec(filename.replace(/\r?\n$|\r$/, "").toLowerCase())![1];
    return [...(this.extensionIndex.get(ext)?.values() ?? [])].sort((a, b) => a.priorityCompare(b));
  }

  addType(type: Type): void {
    add(this.typeVariants, type.simplified, type);
    for (const ext of type.extensions) add(this.extensionIndex, ext, type);
  }
}

function add(container: Map<string, Map<string, Type>>, key: string, value: Type): void {
  let set = container.get(key);
  if (set == null) container.set(key, (set = new Map()));
  if (!set.has(value.simplified)) set.set(value.simplified, value);
}

export const MIME = { Type, Types };
