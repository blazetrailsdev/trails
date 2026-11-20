import { OpenSSL, rbCallSuper, rbObjRespondTo } from "@blazetrails/ruby-compat";

import { InvalidLocaleData } from "../exceptions.js";
import type { Locale } from "../locale.js";
import { _readFile, _readMtime } from "./base.js";
import { Flatten } from "./flatten.js";

interface CacheFileHost {
  pathRoots?: string[] | null;
  initialized?(): boolean;
  lookup(locale: Locale, key: unknown, scope?: unknown): unknown;
  storeTranslations(locale: Locale, data: Record<string, unknown>): unknown;
  normalizedPath(file: string): string;
}

export const CacheFile = {
  pathRoots: null as string[] | null,

  /** @internal */
  loadFile(this: CacheFileHost, filename: string): unknown {
    const initialized = !rbObjRespondTo(this, "initialized") || this.initialized!();
    const key = Flatten.escapeDefaultSeparator(this.normalizedPath(filename));
    const [oldMtime, oldDigest] =
      ((initialized && this.lookup("i18n", key, "loadFile")) as [number, string] | null) || [];
    let mtime: number;
    let digest: string;
    if (
      (mtime = Math.trunc(_readMtime(filename).getTime() / 1000)) === oldMtime ||
      (digest = OpenSSL.Digest.SHA256.hexdigest(_readFile(filename))) === oldDigest
    ) {
      return;
    }
    rbCallSuper(this, CacheFile.loadFile, filename);
    return this.storeTranslations("i18n", { loadFile: { [key]: [mtime, digest] } });
  },

  /** @internal */
  normalizedPath(this: CacheFileHost, file: string): string {
    if (!this.pathRoots) return file;
    const path =
      this.pathRoots.find((root) => file.startsWith(root)) ??
      (() => {
        throw new InvalidLocaleData(file, "outside expected path roots");
      })();
    return file.replace(path, String(this.pathRoots.indexOf(path)));
  },
};
