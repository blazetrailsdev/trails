export type AutoloadPath = string | (() => Promise<unknown>);

export interface Autoload {
  name: string;
  _underPath?: string | null;
  _atPath?: AutoloadPath | null;
  _eagerAutoload?: boolean | null;
  _eagerloadedConstants?: string[] | null;
  _autoloads?: Record<string, AutoloadPath>;
}

/** @missingRailsCall underscore — PERMANENT */
export function autoload(
  this: Autoload,
  constName: string,
  path: AutoloadPath | null = this._atPath ?? null,
): void {
  if (path == null) {
    const full = [this.name, this._underPath, constName].filter((x) => x != null).join("::");
    path = full;
  }

  if (this._eagerAutoload) {
    this._eagerloadedConstants ??= [];
    this._eagerloadedConstants.push(constName);
  }

  (this._autoloads ??= {})[constName] = path;
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

export function autoloadAt(this: Autoload, path: AutoloadPath, block: () => void): void {
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

export async function eagerLoadBang(this: Autoload): Promise<void> {
  if (this._eagerloadedConstants) {
    for (const constName of this._eagerloadedConstants) {
      const path = this._autoloads?.[constName];
      if (
        (this as unknown as Record<string, unknown>)[constName] === undefined &&
        typeof path === "function"
      )
        await path();
    }
    this._eagerloadedConstants = null;
  }
}
