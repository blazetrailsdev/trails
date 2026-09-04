import { URI } from "./common.js";
import { Generic } from "./generic.js";

/**
 * `URI::HTTP` (`vendor/ruby/lib/uri/http.rb:22`), the class `URI.parse`
 * answers for an `http:` URI, and the superclass of {@link HTTPS}.
 *
 * Only `DEFAULT_PORT` is ported; `COMPONENT` (`http.rb:27`) is unsent. `build` (`http.rb:59`) is
 * not, since `Util.make_components_hash` is not; `request_uri`, `authority`
 * and `origin` (`http.rb:76,96,117`) are not, because nothing sends them —
 * and MRI's `authority` here shadows `URI::Generic#authority`
 * (`generic.rb:579`) with a String where the base answers the four-element
 * array `merge` splats, which TypeScript will not let a subclass do.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::HTTP`
 * (`vendor/ruby/lib/uri/http.rb:22`) ships with the interpreter.
 */
export class HTTP extends Generic {
  /** `DEFAULT_PORT` (`vendor/ruby/lib/uri/http.rb:24`). */
  static override readonly DEFAULT_PORT: number | null = 80;
}

URI.registerScheme("HTTP", HTTP);
