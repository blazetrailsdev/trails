import { rbInspect } from "../object.js";
import { constSet } from "../include.js";
import { TopLevel } from "../object.js";
import { Timeout } from "../timeout.js";
import type { HTTP } from "./http.js";
import type { HTTPResponse } from "./http/response.js";
import type { Post } from "./http/requests.js";

/**
 * `Net::OpenTimeout` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:74`), raised when a
 * connection cannot be created within `open_timeout`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails rescues without defining.
 */
export class OpenTimeout extends Timeout.Error {}

OpenTimeout.prototype.name = "Net::OpenTimeout";

/**
 * `Net::ReadTimeout` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:80-94`), raised when
 * a response cannot be read within `read_timeout`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails rescues without defining.
 */
export class ReadTimeout extends Timeout.Error {
  /** @noRailsEquivalent PERMANENT */
  readonly io: unknown;

  /** @noRailsEquivalent PERMANENT */
  constructor(io: unknown = null) {
    super(io != null ? `Net::ReadTimeout with ${rbInspect(io)}` : "Net::ReadTimeout");
    this.io = io;
  }
}

ReadTimeout.prototype.name = "Net::ReadTimeout";

/**
 * Ruby's `Net` module (`vendor/ruby/v3.3.11/lib/net/protocol.rb:26`), each
 * constant seated by the file that defines it.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export const Net = { name: "Net", OpenTimeout, ReadTimeout } as {
  /** @noRailsEquivalent PERMANENT */
  name: string;
  /** @noRailsEquivalent PERMANENT */
  OpenTimeout: typeof OpenTimeout;
  /** @noRailsEquivalent PERMANENT */
  ReadTimeout: typeof ReadTimeout;
  /** @noRailsEquivalent PERMANENT */
  HTTP: typeof HTTP & { Post: typeof Post };
  /** @noRailsEquivalent PERMANENT */
  HTTPResponse: typeof HTTPResponse;
  /** @noRailsEquivalent PERMANENT */
  HTTPUnknownResponse: typeof HTTPResponse;
  /** @noRailsEquivalent PERMANENT */
  HTTPSuccess: typeof HTTPResponse;
  /** @noRailsEquivalent PERMANENT */
  HTTPUnauthorized: typeof HTTPResponse;
};
constSet(TopLevel, "Net", Net);
