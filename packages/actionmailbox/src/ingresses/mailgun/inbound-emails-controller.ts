import { SecurityUtils, TopLevel, isPresent, minutes, squish } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import {
  ArgumentError,
  Encoding,
  OpenSSL,
  env,
  cmp,
  kernelInteger,
  rbCmpint,
} from "@blazetrails/ruby-compat";
import { ActionMailbox } from "../../action-mailbox.js";
import { BaseController } from "../../base-controller.js";

export class InboundEmailsController extends BaseController {
  static {
    this.beforeAction(":authenticate");
    this.paramEncoding("create", "body-mime", Encoding.ASCII_8BIT);
  }

  async create(): Promise<unknown> {
    return await ActionMailbox.InboundEmail.createAndExtractMessageIdBang(this.mail());
  }

  /** @internal */
  private mail(): string {
    let rawEmail = this.params.require("body-mime") as string;
    if (this.params.isKey("recipient"))
      rawEmail = `X-Original-To: ${this.params.require("recipient") as string}\n${rawEmail}`;
    return rawEmail;
  }

  /** @internal */
  private async authenticate(): Promise<void> {
    if (!(await this.isAuthenticated())) this.head(":unauthorized");
  }

  /** @internal */
  private async isAuthenticated(): Promise<boolean> {
    const key = await this.key();
    if (isPresent(key)) {
      return new InboundEmailsController.Authenticator({
        key: key!,
        timestamp: this.params.require("timestamp"),
        token: this.params.require("token") as string,
        signature: this.params.require("signature") as string,
      }).isAuthenticated();
    } else {
      throw new ArgumentError(
        squish(`
          Missing required Mailgun Signing key. Set action_mailbox.mailgun_signing_key in your application's
          encrypted credentials or provide the MAILGUN_INGRESS_SIGNING_KEY environment variable.
        `),
      );
    }
  }

  /** @internal */
  private async key(): Promise<string | null | undefined> {
    const credential = (await TopLevel.Trails!.application!.credentials()).dig(
      "action_mailbox",
      "mailgun_signing_key",
    ) as string | false | null | undefined;
    return credential != null && credential !== false
      ? credential
      : env.MAILGUN_INGRESS_SIGNING_KEY;
  }

  static Authenticator = class Authenticator {
    readonly key: string;
    readonly timestamp: number;
    readonly token: string;
    readonly signature: string;

    constructor({
      key,
      timestamp,
      token,
      signature,
    }: {
      key: string;
      timestamp: unknown;
      token: string;
      signature: string;
    }) {
      [this.key, this.timestamp, this.token, this.signature] = [
        key,
        Number(kernelInteger(timestamp)),
        token,
        signature,
      ];
    }

    isAuthenticated(): boolean {
      return this.isSigned() && this.isRecent();
    }

    /** @internal */
    isSigned(): boolean {
      return SecurityUtils.secureCompare(this.signature, this.expectedSignature());
    }

    /** @internal */
    isRecent(): boolean {
      const time = Time.at(this.timestamp);
      const ago = minutes(2).ago();
      return rbCmpint(cmp(time, ago), time, ago) >= 0;
    }

    /** @internal */
    expectedSignature(): string {
      return OpenSSL.HMAC.hexdigest(
        OpenSSL.Digest.SHA256.new(),
        this.key,
        `${this.timestamp}${this.token}`,
      );
    }
  };
}

ActionMailbox.Ingresses.Mailgun.InboundEmailsController = InboundEmailsController;
