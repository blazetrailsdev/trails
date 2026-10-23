import { setFallbacks } from "../backend/fallbacks.js";
import {
  setAvailableLocales,
  setBackend,
  setDefaultLocale,
  setDefaultSeparator,
  setEnforceAvailableLocales,
  setLoadPath,
  setLocale,
} from "../i18n.js";

export async function setup(): Promise<void> {
  await setLoadPath(null);
  setEnforceAvailableLocales(false);
}

export async function teardown(): Promise<void> {
  setLocale(null);
  setDefaultLocale(null);
  await setLoadPath(null);
  setAvailableLocales(null);
  setBackend(null);
  setDefaultSeparator(null);
  setEnforceAvailableLocales(true);
  setFallbacks(null);
}
