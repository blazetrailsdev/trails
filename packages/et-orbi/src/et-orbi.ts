import { _makeInfo, platformInfo, renderNozoneTime } from "./info.js";
import { isChronicEnabled, make, makeTime, now, parse, setChronicEnabled } from "./make.js";
import { getTzone } from "./zone.js";
import {
  EtOrbi as ZonesEtOrbi,
  ZONES_ISO8601_REX,
  ZONES_OLSON,
  ZONE_ALIASES,
  centosTz,
  debianTz,
  determineLocalTzone,
  extractZone,
  gatherTzs,
  listIso8601Zones,
  osTz,
  osxTz,
  tweakZoneName,
  windowsZoneName,
  zone,
} from "./zones.js";

export const VERSION = "1.2.11";

export const EtOrbi = Object.assign(ZonesEtOrbi, {
  VERSION,
  ZONE_ALIASES,
  ZONES_ISO8601_REX,
  ZONES_OLSON,
  platformInfo,
  _makeInfo,
  renderNozoneTime,
  isChronicEnabled,
  setChronicEnabled,
  now,
  parse,
  makeTime,
  make,
  getTzone,
  listIso8601Zones,
  extractZone,
  determineLocalTzone,
  zone,
  osTz,
  debianTz,
  centosTz,
  osxTz,
  gatherTzs,
  windowsZoneName,
  tweakZoneName,
});

export { EoTime } from "./time.js";
