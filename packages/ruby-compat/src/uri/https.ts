import { URI } from "./common.js";
import { HTTP } from "./http.js";

/**
 * `URI::HTTPS` (`vendor/ruby/lib/uri/https.rb:16`) — `URI::HTTP` with a
 * default port of 443, and the class a `URI::HTTPS === uri` test asks about.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::HTTPS`
 * (`vendor/ruby/lib/uri/https.rb:16`) ships with the interpreter.
 */
export class HTTPS extends HTTP {
  /** `DEFAULT_PORT` (`vendor/ruby/lib/uri/https.rb:18`). */
  static override readonly DEFAULT_PORT: number | null = 443;
}

URI.registerScheme("HTTPS", HTTPS);
