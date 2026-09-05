import { IsolatedExecutionState, isPresent, type SafeBuffer } from "@blazetrails/activesupport";

import type { OutputBuffer } from "../buffers.js";
import { Digestor } from "../digestor.js";
import type { LookupContext } from "../lookup-context.js";
import type { Template } from "../template.js";

export class UncacheableFragmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UncacheableFragmentError";
  }
}

export interface CacheHelperController {
  performCaching?: boolean;
  urlFor(options: unknown): string;
  readFragment(key: unknown, options?: unknown): unknown;
  writeFragment(key: unknown, content: unknown, options?: unknown): unknown;
}

export interface CacheHelperHost {
  controller: CacheHelperController;
  currentTemplate: Template | null;
  lookupContext: LookupContext | null;
  outputBuffer: OutputBuffer;
  viewRenderer?: { cacheHits: Record<string, unknown> };
  safeConcat(string: unknown): unknown;
  viewCacheDependencies(): unknown[];
  cacheFragmentName(name?: unknown, options?: CacheFragmentNameOptions): unknown;
  digestPathFromTemplate(template: Template): string;
}

export interface CacheFragmentNameOptions {
  skipDigest?: unknown;
  digestPath?: string | null;
}

const ACTION_VIEW_CACHING = "action_view_caching";

export const CachingRegistry = {
  isCaching(): boolean {
    const caching = IsolatedExecutionState.get<boolean>(ACTION_VIEW_CACHING);
    return caching != null && caching !== false
      ? caching
      : IsolatedExecutionState.set(ACTION_VIEW_CACHING, false);
  },

  trackCaching<T>(block: () => T): T {
    const cachingWas = IsolatedExecutionState.get<boolean>(ACTION_VIEW_CACHING);
    IsolatedExecutionState.set(ACTION_VIEW_CACHING, true);

    try {
      return block();
    } finally {
      IsolatedExecutionState.set(ACTION_VIEW_CACHING, cachingWas);
    }
  },
};

export function cache(
  this: CacheHelperHost,
  name: unknown = {},
  options: Record<string, unknown> = {},
  block?: () => unknown,
): null {
  if ("performCaching" in this.controller && this.controller.performCaching) {
    CachingRegistry.trackCaching(() => {
      const nameOptions = { skipDigest: options.skipDigest };
      this.safeConcat(
        fragmentFor.call(this, this.cacheFragmentName(name, nameOptions), options, block),
      );
    });
  } else {
    block?.();
  }

  return null;
}

export function isCaching(this: CacheHelperHost): boolean {
  return CachingRegistry.isCaching();
}

export function uncacheableBang(this: CacheHelperHost): void {
  if (isCaching.call(this)) throw new UncacheableFragmentError("can't be fragment cached");
}

export function cacheIf(
  this: CacheHelperHost,
  condition: unknown,
  name: unknown = {},
  options: Record<string, unknown> = {},
  block?: () => unknown,
): null {
  if (condition != null && condition !== false) {
    cache.call(this, name, options, block);
  } else {
    block?.();
  }

  return null;
}

export function cacheUnless(
  this: CacheHelperHost,
  condition: unknown,
  name: unknown = {},
  options: Record<string, unknown> = {},
  block?: () => unknown,
): null {
  return cacheIf.call(this, !(condition != null && condition !== false), name, options, block);
}

export function cacheFragmentName(
  this: CacheHelperHost,
  name: unknown = {},
  { skipDigest, digestPath }: CacheFragmentNameOptions = {},
): unknown {
  if (skipDigest != null && skipDigest !== false) {
    return name;
  } else {
    return fragmentNameWithDigest.call(this, name, digestPath);
  }
}

export function digestPathFromTemplate(this: CacheHelperHost, template: Template): string {
  const digest = Digestor.digest({
    name: template.virtualPath as string,
    format: template.format,
    finder: this.lookupContext as LookupContext,
    dependencies: this.viewCacheDependencies() as string[],
  });

  if (isPresent(digest)) {
    return `${template.virtualPath}:${digest}`;
  } else {
    return template.virtualPath as string;
  }
}

/** @internal */
function fragmentNameWithDigest(
  this: CacheHelperHost,
  name: unknown,
  digestPath: string | null | undefined,
): unknown {
  if (isHash(name)) name = this.controller.urlFor(name).split("://").at(-1);

  if (this.currentTemplate?.virtualPath || digestPath) {
    digestPath ??= this.digestPathFromTemplate(this.currentTemplate as Template);
    return [digestPath, name];
  } else {
    return name;
  }
}

/** @internal */
function fragmentFor(
  this: CacheHelperHost,
  name: unknown = {},
  options?: Record<string, unknown> | null,
  block?: () => unknown,
): unknown {
  const content = readFragmentFor.call(this, name, options);
  if (content != null && content !== false) {
    if (this.viewRenderer !== undefined)
      this.viewRenderer.cacheHits[this.currentTemplate?.virtualPath as string] = "hit";
    return content;
  } else {
    if (this.viewRenderer !== undefined)
      this.viewRenderer.cacheHits[this.currentTemplate?.virtualPath as string] = "miss";
    return writeFragmentFor.call(this, name, options, block);
  }
}

/** @internal */
function readFragmentFor(
  this: CacheHelperHost,
  name: unknown,
  options?: Record<string, unknown> | null,
): unknown {
  return this.controller.readFragment(name, options ?? undefined);
}

/** @internal */
function writeFragmentFor(
  this: CacheHelperHost,
  name: unknown,
  options: Record<string, unknown> | null | undefined,
  block?: () => unknown,
): unknown {
  const fragment: SafeBuffer = this.outputBuffer.capture([], () => {
    block?.();
  });
  return this.controller.writeFragment(name, fragment, options ?? undefined);
}

/** @internal */
function isHash(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
