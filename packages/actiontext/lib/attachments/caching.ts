import { ActionText } from "../action-text.js";
import type { Html5Node } from "@blazetrails/nokogiri";
import { OpenSSL, rbFArray, rbModName } from "@blazetrails/ruby-compat";

interface CachingHost {
  node: Html5Node;
  attachable: { cacheKey(...args: unknown[]): unknown };
  cacheDigest(): string;
}

export const Caching = {
  cacheKey(this: CachingHost, ...args: unknown[]): string {
    return [
      rbModName(this.constructor),
      this.cacheDigest(),
      ...rbFArray(this.attachable.cacheKey(...args)),
    ].join("/");
  },

  /** @internal */
  cacheDigest(this: CachingHost): string {
    return OpenSSL.Digest.SHA256.hexdigest(this.node.toString());
  },
};

ActionText.Attachments.Caching = Caching;
