export type Autoload = {
  name: string;
  loadPath: Record<string, () => Promise<unknown>>;
  _underPath?: string | null;
  _atPath?: string | null;
  _eagerAutoload?: boolean | null;
  _eagerloadedConstants?: string[] | null;
  _autoloads?: Record<string, () => Promise<string>>;
};

export function autoload(
  this: Autoload,
  constName: string,
  path: string | null = this._atPath ?? null,
): void {
  let resolvePath = async () => path!;
  if (path == null) {
    const full = [this.name, this._underPath, constName].filter((x) => x != null).join("::");
    resolvePath = async () => {
      const Inflector = await import("../inflector.js");
      return Inflector.underscore(full);
    };
  }

  if (this._eagerAutoload) {
    this._eagerloadedConstants ??= [];
    this._eagerloadedConstants.push(constName);
  }

  const self = this as unknown as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(this, constName)) {
    if (this._autoloads?.[constName] && self[constName] === undefined) {
      this._autoloads[constName] = resolvePath;
    }
    return;
  }
  (this._autoloads ??= {})[constName] = resolvePath;
  let value: unknown;
  Object.defineProperty(this, constName, {
    get: () => value,
    set: (seated: unknown) => {
      value = seated;
    },
    configurable: true,
    enumerable: true,
  });
}

export function autoloadUnder(this: Autoload, path: string, block: () => void): void {
  const oldPath = this._underPath;
  this._underPath = path;
  try {
    block();
  } finally {
    this._underPath = oldPath;
  }
}

export function autoloadAt(this: Autoload, path: string, block: () => void): void {
  const oldPath = this._atPath;
  this._atPath = path;
  try {
    block();
  } finally {
    this._atPath = oldPath;
  }
}

export function eagerAutoload(this: Autoload, block: () => void): void {
  const oldEager = this._eagerAutoload;
  this._eagerAutoload = true;
  try {
    block();
  } finally {
    this._eagerAutoload = oldEager;
  }
}

/** @missingRailsCall const_get — PERMANENT */
export async function eagerLoadBang(this: Autoload): Promise<void> {
  if (this._eagerloadedConstants) {
    for (const constName of this._eagerloadedConstants) {
      if ((this as unknown as Record<string, unknown>)[constName] === undefined) {
        await this.loadPath[await this._autoloads![constName]()]();
      }
    }
    this._eagerloadedConstants = null;
  }
}
