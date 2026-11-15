import {
  ProtoFatalError,
  ProtocolError,
  ProtoRetriableError,
  ProtoServerError,
} from "../protocol.js";
import type { HTTPResponse } from "./response.js";

/**
 * `Net::HTTPError` (`vendor/ruby/v3.3.11/lib/net/http/exceptions.rb:15-17`), with
 * `HTTPExceptions#initialize` (`:7-10`) inlined.
 *
 * @noRailsEquivalent PERMANENT
 */
export class HTTPError extends ProtocolError {
  /** @noRailsEquivalent PERMANENT */
  readonly response: HTTPResponse;

  constructor(msg: string, res: HTTPResponse) {
    super(msg);
    this.response = res;
  }
}
HTTPError.prototype.name = "Net::HTTPError";

/** @noRailsEquivalent PERMANENT — `Net::HTTPRetriableError` (`vendor/ruby/v3.3.11/lib/net/http/exceptions.rb:19-21`). */
export class HTTPRetriableError extends ProtoRetriableError {
  /** @noRailsEquivalent PERMANENT */
  readonly response: HTTPResponse;

  constructor(msg: string, res: HTTPResponse) {
    super(msg);
    this.response = res;
  }
}
HTTPRetriableError.prototype.name = "Net::HTTPRetriableError";

/** @noRailsEquivalent PERMANENT — `Net::HTTPClientException` (`vendor/ruby/v3.3.11/lib/net/http/exceptions.rb:23-25`). */
export class HTTPClientException extends ProtoServerError {
  /** @noRailsEquivalent PERMANENT */
  readonly response: HTTPResponse;

  constructor(msg: string, res: HTTPResponse) {
    super(msg);
    this.response = res;
  }
}
HTTPClientException.prototype.name = "Net::HTTPClientException";

/** @noRailsEquivalent PERMANENT — `Net::HTTPFatalError` (`vendor/ruby/v3.3.11/lib/net/http/exceptions.rb:27-29`). */
export class HTTPFatalError extends ProtoFatalError {
  /** @noRailsEquivalent PERMANENT */
  readonly response: HTTPResponse;

  constructor(msg: string, res: HTTPResponse) {
    super(msg);
    this.response = res;
  }
}
HTTPFatalError.prototype.name = "Net::HTTPFatalError";
