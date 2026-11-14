import { rbInspect } from "../object.js";
import { constSet } from "../include.js";
import { TopLevel } from "../object.js";
import { Timeout } from "../timeout.js";
import type { HTTP, HTTPHeaderSyntaxError } from "./http.js";
import type { HTTPResponse } from "./http/response.js";
import type * as Responses from "./http/responses.js";
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
 * `Net::ReadAdapter` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:516-537`), the
 * `dest` `read_body` streams into when it is given a block.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export class ReadAdapter {
  private readonly _block: ((str: Uint8Array) => unknown) | null;

  /** @noRailsEquivalent PERMANENT */
  constructor(block: ((str: Uint8Array) => unknown) | null) {
    this._block = block;
  }

  /** @noRailsEquivalent PERMANENT */
  inspect(): string {
    return `#<${this.constructor.name}>`;
  }

  /** @noRailsEquivalent PERMANENT */
  async append(str: Uint8Array): Promise<unknown> {
    if (this._block) return this.callBlock(str, this._block);
    return null;
  }

  /** @internal */
  private async callBlock(str: Uint8Array, block: (str: Uint8Array) => unknown): Promise<unknown> {
    return block(str);
  }
}

/**
 * Ruby's `Net` module (`vendor/ruby/v3.3.11/lib/net/protocol.rb:26`), each
 * constant seated by the file that defines it.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export const Net = { name: "Net", OpenTimeout, ReadTimeout, ReadAdapter } as {
  /** @noRailsEquivalent PERMANENT */
  name: string;
  /** @noRailsEquivalent PERMANENT */
  OpenTimeout: typeof OpenTimeout;
  /** @noRailsEquivalent PERMANENT */
  ReadTimeout: typeof ReadTimeout;
  /** @noRailsEquivalent PERMANENT */
  ReadAdapter: typeof ReadAdapter;
  /** @noRailsEquivalent PERMANENT */
  HTTP: typeof HTTP & { Post: typeof Post };
  /** @noRailsEquivalent PERMANENT */
  HTTPResponse: typeof HTTPResponse;
  /** @noRailsEquivalent PERMANENT */
  HTTPHeaderSyntaxError: typeof HTTPHeaderSyntaxError;
} & typeof Responses;
constSet(TopLevel, "Net", Net);
