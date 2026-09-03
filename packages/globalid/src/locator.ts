import { GlobalID } from "./global-id.js";
import { SignedGlobalID } from "./signed-global-id.js";
import { validateApp } from "./uri/gid.js";
import { safeConstantize } from "@blazetrails/activesupport";
import type { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { ArgumentError } from "@blazetrails/ruby-compat";

/** @noRailsEquivalent PERMANENT */
export interface LocatorModel {
  name: string;
  primaryKey?: string | string[];
  find(id: unknown): Promise<unknown> | unknown;
  where?(conditions: Record<string, unknown>): {
    toArray?(): Promise<unknown[]> | unknown[];
  };
  /** @internal */
  unscoped?<R>(block: () => R | Promise<R>): R | Promise<R>;
}

export interface LocateOptions {
  only?: LocatorModel | LocatorModel[];
  ignoreMissing?: boolean;
}

export interface LocateSignedOptions extends LocateOptions {
  for?: string;
  verifier: MessageVerifier;
}

export type LocatorBlock = (gid: GlobalID, options?: LocateOptions) => Promise<unknown> | unknown;

export interface LocatorLike {
  locate(gid: GlobalID, options?: LocateOptions): Promise<unknown | null>;
  locateMany(gids: GlobalID[], options?: LocateOptions): Promise<unknown[]>;
}

export class BaseLocator {
  async locate(gid: GlobalID, _options: LocateOptions = {}): Promise<unknown | null> {
    if (!this.modelIdIsValid(gid)) return null;
    const klass = safeConstantize(gid.modelName) as LocatorModel | undefined;
    if (!klass) return null;
    const record = await klass.find(gid.modelId);
    return record ?? null;
  }

  async locateMany(gids: GlobalID[], options: LocateOptions = {}): Promise<unknown[]> {
    const idsByClass = new Map<LocatorModel, unknown[]>();
    const allowed: Array<{ gid: GlobalID; klass: LocatorModel }> = [];
    for (const gid of gids) {
      if (!this.modelIdIsValid(gid)) continue;
      const klass = safeConstantize(gid.modelName) as LocatorModel;
      allowed.push({ gid, klass });
      const ids = idsByClass.get(klass) ?? [];
      ids.push(gid.modelId);
      idsByClass.set(klass, ids);
    }

    const byClassAndId = new Map<string, Map<string, unknown>>();
    for (const [klass, ids] of idsByClass) {
      const records = await this.findRecords(klass, ids, options);
      const byId = new Map<string, unknown>();
      const pkProp = recordIdProp(this.primaryKey(klass));
      for (const rec of records) {
        byId.set(idKey((rec as Record<string, unknown>)[pkProp]), rec);
      }
      byClassAndId.set(klass.name, byId);
    }

    const result: unknown[] = [];
    for (const { gid, klass } of allowed) {
      const rec = byClassAndId.get(klass.name)?.get(idKey(gid.modelId));
      if (rec !== undefined) result.push(rec);
    }
    return result;
  }

  /** @internal */
  protected async findRecords(
    modelClass: LocatorModel,
    ids: unknown[],
    options: LocateOptions,
  ): Promise<unknown[]> {
    const pk = this.primaryKey(modelClass);
    if (options.ignoreMissing && modelClass.where && !Array.isArray(pk)) {
      const rel = modelClass.where({ [pk]: ids });
      if (!rel.toArray) {
        throw new Error(
          "LocatorModel.where() returned a relation without .toArray() — required for ignoreMissing.",
        );
      }
      const records = await rel.toArray();
      return Array.isArray(records) ? records : [];
    }
    const result = await modelClass.find(ids);
    return Array.isArray(result) ? result : [result];
  }

  /** @internal */
  protected modelIdIsValid(gid: GlobalID): boolean {
    const modelClass = safeConstantize(gid.modelName) as LocatorModel | undefined;
    if (!modelClass) return false;
    return modelIdArityMatches(modelClass, gid.modelId, this.primaryKey(modelClass));
  }

  /** @internal */
  protected primaryKey(modelClass: LocatorModel): string | string[] {
    return modelClass.primaryKey ?? "id";
  }
}

export class UnscopedLocator extends BaseLocator {
  async locate(gid: GlobalID, options: LocateOptions = {}): Promise<unknown | null> {
    const modelClass = safeConstantize(gid.modelName) as LocatorModel | undefined;
    return this.unscoped(modelClass, () => super.locate(gid, options));
  }

  /** @internal */
  protected async findRecords(
    modelClass: LocatorModel,
    ids: unknown[],
    options: LocateOptions,
  ): Promise<unknown[]> {
    return this.unscoped(modelClass, () => super.findRecords(modelClass, ids, options));
  }

  /** @internal */
  protected unscoped<R>(
    modelClass: LocatorModel | undefined,
    block: () => R | Promise<R>,
  ): R | Promise<R> {
    return modelClass?.unscoped ? modelClass.unscoped(block) : block();
  }
}

export class BlockLocator {
  private readonly _locator: LocatorBlock;

  constructor(block: LocatorBlock) {
    this._locator = block;
  }

  async locate(gid: GlobalID, options: LocateOptions = {}): Promise<unknown | null> {
    const result = await this._locator(gid, options);
    return result ?? null;
  }

  async locateMany(gids: GlobalID[], options: LocateOptions = {}): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const gid of gids) {
      const r = await this.locate(gid, options);
      if (r !== null) results.push(r);
    }
    return results;
  }
}

const _appLocators = new Map<string, LocatorLike>();
let _defaultLocator: LocatorLike = new UnscopedLocator();

export class Locator {
  static async locate(
    gid: string | GlobalID,
    options: LocateOptions = {},
  ): Promise<unknown | null> {
    const parsed = GlobalID.parse(gid);
    if (!parsed) return null;
    const klass = safeConstantize(parsed.modelName) as LocatorModel | undefined;
    if (!klass) return null;
    if (!Locator.findAllowed(klass, options.only)) return null;
    if (!modelIdArityMatches(klass, parsed.modelId)) return null;
    const locator = Locator.locatorFor(parsed);
    const { only: _, ...rest } = options;
    return locator.locate(parsed, rest);
  }

  static async locateMany(
    gids: Array<string | GlobalID>,
    options: LocateOptions = {},
  ): Promise<unknown[]> {
    const allowed = Locator.parseAllowed(gids, options.only);
    if (allowed.length === 0) return [];
    const app = Locator.normalizeApp(allowed[0].app);
    const sameApp = allowed.filter((g) => Locator.normalizeApp(g.app) === app);
    const locator = Locator.locatorFor(allowed[0]);
    const { only: _, ...rest } = options;
    return locator.locateMany(sameApp, rest);
  }

  static async locateSigned(
    sgid: string | SignedGlobalID,
    options: LocateSignedOptions,
  ): Promise<unknown | null> {
    const parsed = SignedGlobalID.parse(String(sgid), {
      for: options.for,
      verifier: options.verifier,
    });
    if (!parsed) return null;
    return Locator.locate(parsed.uri.toString(), options);
  }

  static async locateManySigned(
    sgids: Array<string | SignedGlobalID>,
    options: LocateSignedOptions,
  ): Promise<unknown[]> {
    return Locator.locateMany(
      sgids
        .map((sgid) =>
          SignedGlobalID.parse(String(sgid), { for: options.for, verifier: options.verifier }),
        )
        .filter((sgid) => sgid != null),
      options,
    );
  }

  static get defaultLocator(): LocatorLike {
    return _defaultLocator;
  }
  static set defaultLocator(locator: LocatorLike) {
    _defaultLocator = locator;
  }

  static use(app: string, locator?: LocatorLike | LocatorBlock): void {
    const locatorBlock = typeof locator === "function" ? locator : undefined;
    if (locator == null) {
      throw new ArgumentError(
        "No locator provided. Pass a block or an object that responds to #locate.",
      );
    }

    validateApp(app);

    _appLocators.set(
      Locator.normalizeApp(app),
      locatorBlock === undefined ? (locator as LocatorLike) : new BlockLocator(locatorBlock),
    );
  }

  /** @internal */
  static locatorFor(gid: GlobalID): LocatorLike {
    return _appLocators.get(Locator.normalizeApp(gid.app)) ?? _defaultLocator;
  }

  /** @internal */
  static findAllowed(modelClass: LocatorModel, only?: LocateOptions["only"]): boolean {
    if (!only) return true;
    const list = Array.isArray(only) ? only : [only];
    const fn = modelClass as unknown as Ctor;
    return list.some((c) => {
      const cFn = c as unknown as Ctor;
      return fn === cFn || fn.prototype instanceof cFn;
    });
  }

  /** @internal */
  static parseAllowed(gids: Array<string | GlobalID>, only?: LocateOptions["only"]): GlobalID[] {
    const result: GlobalID[] = [];
    for (const gid of gids) {
      const parsed = GlobalID.parse(gid);
      if (!parsed) continue;
      const modelClass = safeConstantize(parsed.modelName) as LocatorModel | undefined;
      if (!modelClass) continue;
      if (!Locator.findAllowed(modelClass, only)) continue;
      if (!modelIdArityMatches(modelClass, parsed.modelId)) continue;
      result.push(parsed);
    }
    return result;
  }

  /** @internal */
  static normalizeApp(app: string): string {
    return String(app).toLowerCase();
  }
}

/** @internal */
export function _resetLocators(): void {
  _appLocators.clear();
  _defaultLocator = new UnscopedLocator();
}

type Ctor = new (...args: never[]) => unknown;

function recordIdProp(pk: string | string[]): string {
  return Array.isArray(pk) ? "id" : pk;
}

/** @internal */
function modelIdArityMatches(
  klass: LocatorModel,
  modelId: unknown,
  pk: string | string[] = klass.primaryKey ?? "id",
): boolean {
  const pkArity = Array.isArray(pk) ? pk.length : 1;
  const idArity = Array.isArray(modelId) ? modelId.length : 1;
  return idArity === pkArity;
}

function idKey(id: unknown): string {
  return Array.isArray(id) ? JSON.stringify(id.map(String)) : String(id);
}
