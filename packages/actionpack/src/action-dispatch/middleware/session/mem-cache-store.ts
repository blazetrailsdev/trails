import type { RackApp } from "@blazetrails/rack";
import { include } from "@blazetrails/activesupport";
import type { SessionId } from "@blazetrails/rack-session";
import { Compatibility, SessionObject, StaleSessionCheck } from "./abstract-store.js";
import { CacheStore, type CacheStoreSessionOptions } from "./cache-store.js";

export interface MemCacheStoreSessionOptions extends CacheStoreSessionOptions {
  expires?: number;
}

export class MemCacheStore extends CacheStore {
  constructor(app?: RackApp, options: MemCacheStoreSessionOptions = {}) {
    if (options.expireAfter == null && options.expires != null) {
      options.expireAfter = options.expires;
    }
    super(app, options);
  }

  override generateSid(): SessionId {
    return super.generateSid();
  }
}

include(MemCacheStore, Compatibility);
include(MemCacheStore, StaleSessionCheck);
include(MemCacheStore, SessionObject);
