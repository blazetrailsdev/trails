import {
  ProtocolError,
  ProtoFatalError,
  ProtoRetriableError,
  ProtoServerError,
} from "../protocol.js";
import type { HTTPResponse } from "./response.js";

/** @noRailsEquivalent PERMANENT — `Net::HTTPError` (`vendor/ruby/v3.3.11/lib/net/http/exceptions.rb:13-15`). */
export class HTTPError extends ProtocolError {
  /** @noRailsEquivalent PERMANENT */
  readonly response: HTTPResponse;

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/exceptions.rb:6-9`. */
  constructor(msg: string, res: HTTPResponse) {
    super(msg);
    this.response = res;
  }
}
HTTPError.prototype.name = "Net::HTTPError";

/** @noRailsEquivalent PERMANENT — `Net::HTTPRetriableError` (`vendor/ruby/v3.3.11/lib/net/http/exceptions.rb:17-19`). */
export class HTTPRetriableError extends ProtoRetriableError {
  /** @noRailsEquivalent PERMANENT */
  readonly response: HTTPResponse;

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/exceptions.rb:6-9`. */
  constructor(msg: string, res: HTTPResponse) {
    super(msg);
    this.response = res;
  }
}
HTTPRetriableError.prototype.name = "Net::HTTPRetriableError";

/** @noRailsEquivalent PERMANENT — `Net::HTTPClientException` (`vendor/ruby/v3.3.11/lib/net/http/exceptions.rb:21-23`). */
export class HTTPClientException extends ProtoServerError {
  /** @noRailsEquivalent PERMANENT */
  readonly response: HTTPResponse;

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/exceptions.rb:6-9`. */
  constructor(msg: string, res: HTTPResponse) {
    super(msg);
    this.response = res;
  }
}
HTTPClientException.prototype.name = "Net::HTTPClientException";

/** @noRailsEquivalent PERMANENT — `Net::HTTPFatalError` (`vendor/ruby/v3.3.11/lib/net/http/exceptions.rb:25-27`). */
export class HTTPFatalError extends ProtoFatalError {
  /** @noRailsEquivalent PERMANENT */
  readonly response: HTTPResponse;

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/exceptions.rb:6-9`. */
  constructor(msg: string, res: HTTPResponse) {
    super(msg);
    this.response = res;
  }
}
HTTPFatalError.prototype.name = "Net::HTTPFatalError";
