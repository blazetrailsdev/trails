import {
  Monitor,
  Mutex,
  SecureRandom,
  include,
  rbInspect,
  type Included,
} from "@blazetrails/ruby-compat";
import type { Cref } from "./cref.js";
import { Map } from "./cref/map.js";
import { Error as ZeitwerkError } from "./error.js";
import { Inflector } from "./inflector.js";
import { Config } from "./loader/config.js";
import { Helpers } from "./loader/helpers.js";
import { RealModName } from "./real-mod-name.js";
import { Registry } from "./registry.js";

const MUTEX = new Mutex();

export type Logger = ((message: string) => unknown) | { debug(message: string): unknown };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Loader
  extends Included<typeof RealModName>, Included<typeof Helpers>, Included<typeof Config> {
  tag: string;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Loader {
  static defaultLogger: Logger | null = null;

  inflector: Inflector;
  logger: Logger | null;
  /** @internal */ _tag: string;
  /** @internal */ _initializedAt: Date;
  roots: Record<string, object>;
  /** @internal */ ignoredGlobPatterns: Set<string>;
  /** @internal */ ignoredPaths: Set<string>;
  /** @internal */ collapseGlobPatterns: Set<string>;
  /** @internal */ collapseDirs: Set<string>;
  /** @internal */ eagerLoadExclusions: Set<string>;
  /** @internal */ _reloadingEnabled: boolean;
  /** @internal */ onSetupCallbacks: (() => unknown)[];
  /** @internal */ onLoadCallbacks: Record<string, ((...args: never[]) => unknown)[]>;
  /** @internal */ onUnloadCallbacks: Record<string, ((...args: never[]) => unknown)[]>;

  autoloads: Record<string, Cref>;
  autoloadedDirs: string[];
  toUnload: Record<string, Cref>;
  namespaceDirs: Map<string[]>;
  shadowedFiles: Set<string>;
  /** @internal */ _setup: boolean;
  /** @internal */ _eagerLoaded: boolean;
  /** @internal */ mutex: Mutex;
  /** @internal */ dirsAutoloadMonitor: Monitor;

  /** @inlinedFrom Zeitwerk::Loader::Config#initialize zeitwerk/v2.7.2/lib/zeitwerk/loader/config.rb:86-101 */
  constructor() {
    this.inflector = new Inflector();
    this.logger = (this.constructor as typeof Loader).defaultLogger;
    this._tag = SecureRandom.hex(3);
    this._initializedAt = new Date();
    this.roots = {};
    this.ignoredGlobPatterns = new Set();
    this.ignoredPaths = new Set();
    this.collapseGlobPatterns = new Set();
    this.collapseDirs = new Set();
    this.eagerLoadExclusions = new Set();
    this._reloadingEnabled = false;
    this.onSetupCallbacks = [];
    this.onLoadCallbacks = {};
    this.onUnloadCallbacks = {};

    this.autoloads = {};
    this.autoloadedDirs = [];
    this.toUnload = {};
    this.namespaceDirs = new Map();
    this.shadowedFiles = new Set();
    this._setup = false;
    this._eagerLoaded = false;

    this.mutex = new Mutex();
    this.dirsAutoloadMonitor = new Monitor();

    Registry.registerLoader(this);
  }

  /** @internal */
  raiseIfConflictingDirectory(dir: string): void {
    MUTEX.synchronize(() => {
      const dirSlash = `${dir}/`;

      for (const loader of Registry.loaders) {
        if (loader === this) continue;
        if (loader.isIgnores(dir)) continue;

        for (const rootDir of Object.keys(loader.roots)) {
          if (this.isIgnores(rootDir)) continue;

          const rootDirSlash = `${rootDir}/`;
          if (dirSlash.startsWith(rootDirSlash) || rootDirSlash.startsWith(dirSlash)) {
            throw new ZeitwerkError(
              `loader\n\n${rbInspect(this)}\n\n\nwants to manage directory ${dir},` +
                ` which is already managed by\n\n${rbInspect(loader)}\n\n`,
            );
          }
        }
      }
    });
  }
}

include(Loader, RealModName);
include(Loader, Helpers);
include(Loader, Config);
