import {
  Concern,
  Duration,
  Module,
  classAttribute,
  extend,
  tryCall,
} from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { hashDelete, hashReplace, mergeBang } from "@blazetrails/ruby-compat";
import type { Metal } from "../metal.js";
import { Head, type head } from "./head.js";
import type { CacheControlHash } from "../../action-dispatch/http/cache.js";

export type ConditionalGetHost = Pick<Metal, "request" | "response"> & {
  head: OmitThisParameter<typeof head>;
  etaggers: Etagger[];
  freshWhen: typeof freshWhen;
  isStale: typeof isStale;
  expiresIn: typeof expiresIn;
  combineEtags: typeof combineEtags;
};

export interface FreshWhenOptions {
  etag?: unknown;
  weakEtag?: unknown;
  strongEtag?: unknown;
  lastModified?: Date | Time | { epochMilliseconds: number } | false | null | undefined;
  public?: boolean;
  cacheControl?: CacheControlHash;
  template?: string | false | null;
}

export async function freshWhen(
  this: ConditionalGetHost,
  object: unknown = null,
  {
    etag = null,
    weakEtag = null,
    strongEtag = null,
    lastModified = null,
    public: public_ = false,
    cacheControl = {},
    template = null,
  }: FreshWhenOptions = {},
): Promise<void> {
  hashDelete(this.response.cacheControl, "noStore");
  if (strongEtag == null || strongEtag === false) {
    if (weakEtag == null || weakEtag === false) {
      weakEtag = etag != null && etag !== false ? etag : object;
    }
  }
  if (lastModified == null || lastModified === false) {
    const updatedAt = tryCall(object as object, "updatedAt");
    lastModified = (
      updatedAt != null && updatedAt !== false
        ? updatedAt
        : await tryCall(object as object, "maximum", "updatedAt")
    ) as Date | null;
  }

  if (strongEtag != null && strongEtag !== false) {
    this.response.strongEtag(
      this.combineEtags(strongEtag, { lastModified, public: public_, template }),
    );
  } else if ((weakEtag != null && weakEtag !== false) || (template != null && template !== false)) {
    this.response.weakEtag(
      this.combineEtags(weakEtag, { lastModified, public: public_, template }),
    );
  }

  if (lastModified != null) this.response.lastModified = lastModified;
  if (public_) this.response.cacheControl.public = true;
  mergeBang(this.response.cacheControl, cacheControl);

  if (this.request.fresh(this.response)) this.head("not_modified");
}

export async function isStale(
  this: ConditionalGetHost,
  object: unknown = null,
  freshnessKwargs: FreshWhenOptions = {},
): Promise<boolean> {
  await this.freshWhen(object, freshnessKwargs);
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
  hashReplace(this.response.cacheControl, { noCache: true });
}

/** @missingRailsArgs stale? — PERMANENT */
export async function httpCacheForever(
  this: ConditionalGetHost,
  { public: public_ = false }: { public?: boolean } = {},
  block?: () => unknown,
): Promise<void> {
  this.expiresIn(Duration.years(100), { public: public_, immutable: true });

  if (
    await this.isStale(null, {
      etag: this.request.fullpath,
      lastModified: Time.new(2011, 1, 1).utc(),
      public: public_,
    })
  ) {
    await block?.();
  }
}

export function noStore(this: ConditionalGetHost): void {
  hashReplace(this.response.cacheControl, { noStore: true });
}

export type Etagger = (this: unknown, options: Record<string, unknown>) => unknown;

export const ClassMethods = {
  etag(this: { etaggers: Etagger[] }, etagger: Etagger): void {
    this.etaggers = [...this.etaggers, etagger];
  },
};

export const ConditionalGet = new Module((mod) => {
  extend(mod, Concern);

  mod.include(Head);

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
  head: typeof head;
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
