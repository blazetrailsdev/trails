import {
  Base64,
  IOError,
  Net,
  OpenSSL,
  SocketError,
  Struct,
  SystemCallError,
  Timeout,
  URI,
  type HTTP as URIHTTP,
} from "@blazetrails/ruby-compat";
import { ActionMailbox } from "./action-mailbox.js";
import { version } from "./version.js";

export class Relayer {
  static Result = class Result extends Struct.new("statusCode", "message") {
    declare statusCode: string;
    declare message: string;

    isSuccess(): boolean {
      return !this.isFailure();
    }

    isFailure(): boolean {
      return this.isTransientFailure() || this.isPermanentFailure();
    }

    isTransientFailure(): boolean {
      return this.statusCode.startsWith("4.");
    }

    isPermanentFailure(): boolean {
      return this.statusCode.startsWith("5.");
    }
  };

  static CONTENT_TYPE = "message/rfc822";
  static USER_AGENT = `Action Mailbox relayer v${version()}`;

  readonly uri: URIHTTP;
  readonly username: string;
  readonly password: string;
  private _client: InstanceType<typeof Net.HTTP> | null = null;

  constructor({
    url,
    username = "actionmailbox",
    password,
  }: {
    url: string;
    username?: string;
    password: string;
  }) {
    [this.uri, this.username, this.password] = [URI.parse(url) as URIHTTP, username, password];
  }

  async relay(source: string): Promise<InstanceType<typeof Relayer.Result>> {
    try {
      const response: { code: string } = await this.post(source);
      if (response instanceof Net.HTTPSuccess) {
        return new Relayer.Result("2.0.0", "Successfully relayed message to ingress");
      } else if (response instanceof Net.HTTPUnauthorized) {
        return new Relayer.Result("4.7.0", "Invalid credentials for ingress");
      } else {
        return new Relayer.Result("4.0.0", `HTTP ${response.code}`);
      }
    } catch (error) {
      if (
        error instanceof IOError ||
        error instanceof SocketError ||
        error instanceof SystemCallError
      ) {
        return new Relayer.Result("4.4.2", `Network error relaying to ingress: ${error.message}`);
      } else if (error instanceof Timeout.Error) {
        return new Relayer.Result("4.4.2", "Timed out relaying to ingress");
      } else if (error instanceof Error) {
        return new Relayer.Result("4.0.0", `Error relaying to ingress: ${error.message}`);
      }
      throw error;
    }
  }

  /** @internal */
  private post(source: string): Promise<InstanceType<typeof Net.HTTPResponse>> {
    return this.client().post(this.uri, source, {
      "Content-Type": Relayer.CONTENT_TYPE,
      "User-Agent": Relayer.USER_AGENT,
      Authorization: `Basic ${Base64.strictEncode64(this.username + ":" + this.password)}`,
    });
  }

  /** @internal */
  private client(): InstanceType<typeof Net.HTTP> {
    return (this._client ??= (() => {
      const connection = new Net.HTTP(this.uri.host!, this.uri.port);
      if (this.uri.scheme === "https") {
        connection.useSsl = true;
        connection.verifyMode = OpenSSL.SSL.VERIFY_PEER;
      }

      connection.openTimeout = 1;
      connection.readTimeout = 10;
      return connection;
    })());
  }
}

ActionMailbox.Relayer = Relayer;
