import { HTTPRequest } from "./request.js";

/**
 * `Net::HTTP::Post` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:97-101`).
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export class Post extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "POST";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = true;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}
