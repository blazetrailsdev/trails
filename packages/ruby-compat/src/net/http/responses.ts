import { Net } from "../protocol.js";
import { HTTPResponse } from "./response.js";

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:7` */
export class HTTPUnknownResponse extends HTTPResponse {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:21` */
export class HTTPInformation extends HTTPResponse {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = false;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:36` */
export class HTTPSuccess extends HTTPResponse {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:51` */
export class HTTPRedirection extends HTTPResponse {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:65` */
export class HTTPClientError extends HTTPResponse {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:79` */
export class HTTPServerError extends HTTPResponse {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY: boolean = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:164` */
export class HTTPOK extends HTTPSuccess {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY = true;
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/responses.rb:490` */
export class HTTPUnauthorized extends HTTPClientError {
  /** @noRailsEquivalent PERMANENT */
  static override readonly HAS_BODY = true;
}

HTTPResponse.CODE_CLASS_TO_OBJ = {
  "1": HTTPInformation,
  "2": HTTPSuccess,
  "3": HTTPRedirection,
  "4": HTTPClientError,
  "5": HTTPServerError,
};
HTTPResponse.CODE_TO_OBJ = {
  "200": HTTPOK,
  "401": HTTPUnauthorized,
};

Net.HTTPResponse = HTTPResponse;
Net.HTTPUnknownResponse = HTTPUnknownResponse;
Net.HTTPSuccess = HTTPSuccess;
Net.HTTPUnauthorized = HTTPUnauthorized;
