import { RELEASE } from "@blazetrails/rack";
import { Gem } from "@blazetrails/ruby-compat";

export let VARY: string;
export let CONTENT_ENCODING: string;
export let CONTENT_SECURITY_POLICY: string;
export let CONTENT_SECURITY_POLICY_REPORT_ONLY: string;
export let LOCATION: string;
export let FEATURE_POLICY: string;
export let X_REQUEST_ID: string;
export let X_CASCADE: string;
export let SERVER_TIMING: string;
export let STRICT_TRANSPORT_SECURITY: string;

if (new Gem.Version(RELEASE).compare(new Gem.Version("3"))! < 0) {
  VARY = "Vary";
  CONTENT_ENCODING = "Content-Encoding";
  CONTENT_SECURITY_POLICY = "Content-Security-Policy";
  CONTENT_SECURITY_POLICY_REPORT_ONLY = "Content-Security-Policy-Report-Only";
  LOCATION = "Location";
  FEATURE_POLICY = "Feature-Policy";
  X_REQUEST_ID = "X-Request-Id";
  X_CASCADE = "X-Cascade";
  SERVER_TIMING = "Server-Timing";
  STRICT_TRANSPORT_SECURITY = "Strict-Transport-Security";
} else {
  VARY = "vary";
  CONTENT_ENCODING = "content-encoding";
  CONTENT_SECURITY_POLICY = "content-security-policy";
  CONTENT_SECURITY_POLICY_REPORT_ONLY = "content-security-policy-report-only";
  LOCATION = "location";
  FEATURE_POLICY = "feature-policy";
  X_REQUEST_ID = "x-request-id";
  X_CASCADE = "x-cascade";
  SERVER_TIMING = "server-timing";
  STRICT_TRANSPORT_SECURITY = "strict-transport-security";
}
