import { HTTPRequest } from "./request.js";

/**
 * `Net::HTTP::Get` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:31-35`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Get extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "GET";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = false;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}

/**
 * `Net::HTTP::Head` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:62-66`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Head extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "HEAD";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = false;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = false;
}

/**
 * `Net::HTTP::Post` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:97-101`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Post extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "POST";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = true;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}

/**
 * `Net::HTTP::Put` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:127-131`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Put extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "PUT";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = true;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}

/**
 * `Net::HTTP::Delete` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:159-163`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Delete extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "DELETE";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = false;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}

/**
 * `Net::HTTP::Options` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:190-194`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Options extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "OPTIONS";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = false;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}

/**
 * `Net::HTTP::Trace` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:221-225`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Trace extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "TRACE";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = false;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}

/**
 * `Net::HTTP::Patch` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:255-259`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Patch extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "PATCH";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = true;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}

/**
 * `Net::HTTP::Propfind` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:282-286`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Propfind extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "PROPFIND";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = true;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}

/**
 * `Net::HTTP::Proppatch` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:305-309`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Proppatch extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "PROPPATCH";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = true;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}

/**
 * `Net::HTTP::Mkcol` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:328-332`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Mkcol extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "MKCOL";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = true;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}

/**
 * `Net::HTTP::Copy` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:351-355`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Copy extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "COPY";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = false;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}

/**
 * `Net::HTTP::Move` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:374-378`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Move extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "MOVE";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = false;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}

/**
 * `Net::HTTP::Lock` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:397-401`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Lock extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "LOCK";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = true;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}

/**
 * `Net::HTTP::Unlock` (`vendor/ruby/v3.3.11/lib/net/http/requests.rb:420-424`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Unlock extends HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static override readonly METHOD = "UNLOCK";
  /** @noRailsEquivalent PERMANENT */
  static override readonly REQUEST_HAS_BODY = true;
  /** @noRailsEquivalent PERMANENT */
  static override readonly RESPONSE_HAS_BODY = true;
}
