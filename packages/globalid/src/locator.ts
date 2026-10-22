import { GlobalID } from "./global-id.js";
import { SignedGlobalID, type ParseOptions } from "./signed-global-id.js";
import { GID } from "./uri/gid.js";
import { indexBy } from "@blazetrails/activesupport";
import {
  ArgumentError,
  compact,
  except,
  rbFArray,
  rbModConstSet,
  rbObjMethod,
  slice,
  StandardError,
} from "@blazetrails/ruby-compat";

/** @noRailsEquivalent PERMANENT */
export interface LocatorModel {
  name: string;
  primaryKey?: string | string[];
  find(id: unknown): Promise<unknown> | unknown;
  where?(conditions: Map<string | string[], unknown>): PromiseLike<unknown[]> | unknown[];
  includes?(includes: unknown): LocatorModel;
  /** @internal */
  unscoped?<R>(block: () => R | Promise<R>): R | Promise<R>;
}

export class InvalidModelIdError extends StandardError {}

export interface LocateOptions {
  only?: LocatorModel | LocatorModel[];
  ignoreMissing?: boolean;
  includes?: unknown;
}

export type LocateSignedOptions = LocateOptions & ParseOptions;

export type LocatorBlock = (gid: GlobalID, options?: LocateOptions) => Promise<unknown> | unknown;

export interface LocatorLike {
  locate(gid: GlobalID, options?: LocateOptions): Promise<unknown | null>;
  locateMany(gids: GlobalID[], options?: LocateOptions): Promise<unknown[]>;
}

export class BaseLocator {
  async locate(gid: GlobalID, options: LocateOptions = {}): Promise<unknown | null> {
    if (!this.modelIdIsValid(gid)) return null;
    let modelClass = gid.modelClass;
    if (options.includes) modelClass = modelClass.includes!(options.includes);

    return modelClass.find(gid.modelId);
  }

  async locateMany(gids: GlobalID[], options: LocateOptions = {}): Promise<unknown[]> {
    const idsByModel = new Map<LocatorModel, unknown[]>();

    for (const gid of gids) {
      if (!this.modelIdIsValid(gid)) continue;
      if (!idsByModel.has(gid.modelClass)) idsByModel.set(gid.modelClass, []);
      idsByModel.get(gid.modelClass)!.push(gid.modelId);
    }

    const recordsByModelNameAndId: Record<string, Record<string, unknown>> = {};

    for (const [model, ids] of idsByModel) {
      const records = await this.findRecords(model, ids, {
        ignoreMissing: options.ignoreMissing,
        includes: options.includes,
      });

      const recordsById = indexBy(records as Array<{ id: unknown }>, (record) =>
        Array.isArray(record.id) ? String(record.id.map(String)) : String(record.id),
      );

      recordsByModelNameAndId[model.name] = recordsById;
    }

    return gids
      .map((gid) => recordsByModelNameAndId[gid.modelName][String(gid.modelId)])
      .filter((record) => record != null && record !== false);
  }

  /** @internal */
  protected async findRecords(
    modelClass: LocatorModel,
    ids: unknown[],
    options: LocateOptions,
  ): Promise<unknown[]> {
    if (options.includes) modelClass = modelClass.includes!(options.includes);
    if (options.ignoreMissing) {
      return modelClass.where!(new Map([[this.primaryKey(modelClass), ids]]));
    } else {
      return modelClass.find(ids) as Promise<unknown[]>;
    }
  }

  /** @internal */
  protected modelIdIsValid(gid: GlobalID): boolean {
    return rbFArray(gid.modelId).length === rbFArray(this.primaryKey(gid.modelClass)).length;
  }

  /** @internal */
  protected primaryKey(modelClass: LocatorModel): string | string[] {
    return modelClass.primaryKey ?? "id";
  }
}

export class UnscopedLocator extends BaseLocator {
  async locate(gid: GlobalID, options: LocateOptions = {}): Promise<unknown | null> {
    return this.unscoped(gid.modelClass, () => super.locate(gid, options));
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
  protected unscoped<R>(modelClass: LocatorModel, block: () => R | Promise<R>): R | Promise<R> {
    return modelClass.unscoped ? modelClass.unscoped(block) : block();
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
    gid = GlobalID.parse(gid) as GlobalID;

    if (!(gid && Locator.findAllowed(gid.modelClass, options.only))) return null;

    const locator = Locator.locatorFor(gid);

    if (rbObjMethod(locator, "locate").arity() === 1) {
      GlobalID.deprecator().warn(
        "It seems your locator is defining the `locate` method only with one argument. Please make sure your locator is receiving the options argument as well, like `locate(gid, options = {})`.",
      );
      return locator.locate(gid);
    } else {
      return locator.locate(gid, except(options as Record<string, unknown>, "only"));
    }
  }

  static async locateMany(
    gids: Array<string | GlobalID>,
    options: LocateOptions = {},
  ): Promise<unknown[]> {
    const allowedGids = Locator.parseAllowed(gids, options.only);
    if (allowedGids.length > 0) {
      const locator = Locator.locatorFor(allowedGids[0]);
      return locator.locateMany(allowedGids, options);
    } else {
      return [];
    }
  }

  static async locateSigned(
    sgid: string | SignedGlobalID,
    options: LocateSignedOptions = {},
  ): Promise<unknown | null> {
    return SignedGlobalID.find(sgid, options);
  }

  static async locateManySigned(
    sgids: Array<string | SignedGlobalID>,
    options: LocateSignedOptions = {},
  ): Promise<unknown[]> {
    return Locator.locateMany(
      compact(sgids.map((sgid) => SignedGlobalID.parse(String(sgid), slice(options, "for")))),
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

    GID.validateApp(app);

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
    return compact(gids.map((gid) => GlobalID.parse(gid))).filter((gid) =>
      Locator.findAllowed(gid.modelClass, only),
    );
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

type LocatorInvalidModelIdError = typeof InvalidModelIdError;

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Locator {
  const InvalidModelIdError: LocatorInvalidModelIdError;
}
rbModConstSet(Locator, "InvalidModelIdError", InvalidModelIdError);

GlobalID.Locator = Locator;
