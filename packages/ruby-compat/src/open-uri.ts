import { StandardError } from "./standard-error.js";

/**
 * Ruby's `OpenURI` (`vendor/ruby/v3.3.11/lib/open-uri.rb:92`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const OpenURI = {
  /**
   * `OpenURI::HTTPError` (`vendor/ruby/v3.3.11/lib/open-uri.rb:380-386`).
   *
   * @noRailsEquivalent PERMANENT
   */
  HTTPError: class HTTPError extends StandardError {
    /** @noRailsEquivalent PERMANENT */
    readonly io: unknown;

    /** @noRailsEquivalent PERMANENT */
    constructor(message: string, io: unknown) {
      super(message);
      this.io = io;
    }
  },
};
