import { Headers as RackHeaders } from "@blazetrails/rack";

/** @missingRailsCall new — PERMANENT */
export function Headers(headers: unknown): RackHeaders {
  return RackHeaders.get(headers);
}
