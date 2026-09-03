import { Deprecation } from "@blazetrails/activesupport";
import * as _cookies from "./middleware/cookies.js";

export { Deprecation as Deprecator };

let _deprecator: Deprecation | undefined;

export function deprecator(): Deprecation {
  if (!_deprecator) _deprecator = new Deprecation();
  return _deprecator;
}

/** @internal */ export const cookieJar = _cookies.cookieJar;
/** @internal */ export const isHaveCookieJar = _cookies.isHaveCookieJar;
/** @internal */ export const keyGenerator = _cookies.keyGenerator;
/** @internal */ export const signedCookieSalt = _cookies.signedCookieSalt;
/** @internal */ export const encryptedCookieSalt = _cookies.encryptedCookieSalt;
/** @internal */ export const encryptedSignedCookieSalt = _cookies.encryptedSignedCookieSalt;
/** @internal */ export const authenticatedEncryptedCookieSalt =
  _cookies.authenticatedEncryptedCookieSalt;
/** @internal */ export const useAuthenticatedCookieEncryption =
  _cookies.useAuthenticatedCookieEncryption;
/** @internal */ export const encryptedCookieCipher = _cookies.encryptedCookieCipher;
/** @internal */ export const signedCookieDigest = _cookies.signedCookieDigest;
/** @internal */ export const secretKeyBase = _cookies.secretKeyBase;
/** @internal */ export const cookiesSerializer = _cookies.cookiesSerializer;
/** @internal */ export const cookiesSameSiteProtection = _cookies.cookiesSameSiteProtection;
/** @internal */ export const cookiesDigest = _cookies.cookiesDigest;
/** @internal */ export const cookiesRotations = _cookies.cookiesRotations;
/** @internal */ export const useCookiesWithMetadata = _cookies.useCookiesWithMetadata;
