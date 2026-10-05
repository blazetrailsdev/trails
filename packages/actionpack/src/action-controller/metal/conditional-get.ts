import {
  Concern,
  Duration,
  Module,
  classAttribute,
  extend,
  tryCall,
} from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { hashDelete, mergeBang } from "@blazetrails/ruby-compat";
import type { Metal } from "../metal.js";
import type { CacheControlHash } from "../../action-dispatch/http/cache.js";

export type ConditionalGetHost = Pick<Metal, "request" | "response" | "head"> & {
  etaggers: Etagger[];
};

export interface FreshWhenOptions {
  etag?: unknown;
  weakEtag?: unknown;
  strongEtag?: unknown;
  lastModified?: Date | Time | { epochMilliseconds: number } | null | undefined;
  public?: boolean;
  cacheControl?: CacheControlHash;
  template?: string | false | null;
}

export function freshWhen(
  this: ConditionalGetHost,
  object: unknown = null,
  {
    etag = null,
    weakEtag = null,
    strongEtag = null,
    lastModified = null,
    public: isPublic = false,
    cacheControl = {},
    template = null,
  }: FreshWhenOptions = {},
): void {
  hashDelete(this.response.cacheControl, "noStore");
  if (strongEtag == null || strongEtag === false) weakEtag ??= etag ?? object;
  lastModified ??= (tryCall(object as object, "updatedAt") ??
    tryCall(object as object, "maximum", "updatedAt") ??
    null) as Date | null;

  if (strongEtag != null && strongEtag !== false) {
    this.response.strongEtag(
      combineEtags.call(this, strongEtag, { lastModified, public: isPublic, template }),
    );
  } else if ((weakEtag != null && weakEtag !== false) || (template != null && template !== false)) {
    this.response.weakEtag(
      combineEtags.call(this, weakEtag, { lastModified, public: isPublic, template }),
    );
  }

  if (lastModified != null) this.response.lastModified = lastModified as Date;
  if (isPublic) this.response.cacheControl.public = true;
  mergeBang(this.response.cacheControl, cacheControl);

  if (this.request.fresh(this.response)) this.head("not_modified");
}

export function isStale(
  this: ConditionalGetHost,
  object: unknown = null,
  freshnessKwargs: FreshWhenOptions = {},
): boolean {
  freshWhen.call(this, object, freshnessKwargs);
  return !this.request.fresh(this.response);
}

export function expiresIn(
  this: ConditionalGetHost,
  seconds: number | Duration,
  options: Record<string, unknown> = {},
): void {
  hashDelete(this.response.cacheControl, "noStore");
  mergeBang(this.response.cacheControl, {
    maxAge: seconds,
    public: hashDelete(options, "public"),
    mustRevalidate: hashDelete(options, "mustRevalidate"),
    staleWhileRevalidate: hashDelete(options, "staleWhileRevalidate"),
    staleIfError: hashDelete(options, "staleIfError"),
    immutable: hashDelete(options, "immutable"),
  });
  hashDelete(options, "private");

  this.response.cacheControl.extras = Object.entries(options).map(([k, v]) => `${k}=${v}`);
  if (!this.response.isDate) this.response.date = Time.now();
}

export function expiresNow(this: ConditionalGetHost): void {
  const cacheControl = this.response.cacheControl;
  for (const key of Object.keys(cacheControl)) delete cacheControl[key];
  cacheControl.noCache = true;
}

export function httpCacheForever(
  this: ConditionalGetHost,
  { public: isPublic = false }: { public?: boolean } = {},
  block?: () => void,
): void {
  expiresIn.call(this, Duration.years(100), { public: isPublic, immutable: true });

  if (
    isStale.call(this, null, {
      etag: this.request.fullpath,
      lastModified: Time.new(2011, 1, 1).utc(),
      public: isPublic,
    })
  ) {
    block?.();
  }
}

export function noStore(this: ConditionalGetHost): void {
  const cacheControl = this.response.cacheControl;
  for (const key of Object.keys(cacheControl)) delete cacheControl[key];
  cacheControl.noStore = true;
}

export type Etagger = (this: unknown, options: Record<string, unknown>) => unknown;

export const ClassMethods = {
  etag(this: { etaggers: Etagger[] }, etagger: Etagger): void {
    this.etaggers = [...this.etaggers, etagger];
  },
};

/** @missingRailsCall include — CONVERGEABLE head-is-a-module-included-by-conditional-get-not-a-metal-method */
export const ConditionalGet = new Module((mod) => {
  extend(mod, Concern);

  (mod as unknown as { included(base: null, block: (this: object) => void): void }).included(
    null,
    function (this: object) {
      classAttribute.call(this, "etaggers", { default: [] });
    },
  );

  mod.defineMethod("freshWhen", freshWhen);
  mod.defineMethod("isStale", isStale);
  mod.defineMethod("expiresIn", expiresIn);
  mod.defineMethod("expiresNow", expiresNow);
  mod.defineMethod("httpCacheForever", httpCacheForever);
  mod.defineMethod("noStore", noStore);
  mod.defineMethod("combineEtags", combineEtags);
}) as Module<{
  freshWhen: typeof freshWhen;
  isStale: typeof isStale;
  expiresIn: typeof expiresIn;
  expiresNow: typeof expiresNow;
  httpCacheForever: typeof httpCacheForever;
  noStore: typeof noStore;
  combineEtags: typeof combineEtags;
}> & { ClassMethods: typeof ClassMethods };
ConditionalGet.ClassMethods = ClassMethods;

/** @internal */
export function combineEtags(
  this: { etaggers: Etagger[] },
  validator: unknown,
  options: Record<string, unknown> = {},
): unknown[] {
  return [validator, ...this.etaggers.map((etagger) => etagger.call(this, options))].filter(
    (e) => e !== null && e !== undefined,
  );
}
