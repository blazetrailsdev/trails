import { constSet } from "@blazetrails/ruby-compat";
import { SecurityUtils, TopLevel, isPresent, minutes, squish } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import {
  ArgumentError,
  Encoding,
  OpenSSL,
  env,
  isBetween,
  kernelInteger,
  rbStrPlus,
  type Comparable,
} from "@blazetrails/ruby-compat";
import { ActionMailbox } from "../../../../../action-mailbox.js";
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
  private mail(): Uint8Array {
    let rawEmail = this.params.require("body-mime") as Uint8Array;
    if (this.params.isKey("recipient"))
      rawEmail = rbStrPlus(
        new TextEncoder().encode(`X-Original-To: ${this.params.require("recipient") as string}\n`),
        rawEmail,
      ) as Uint8Array;
    return rawEmail;
  }

  /** @internal */
  private async authenticate(): Promise<void> {
    if (!(await this.isAuthenticated())) await this.head(":unauthorized");
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
    readonly timestamp: number | bigint;
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
        kernelInteger(timestamp),
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
      return isBetween.call(
        Time.at(this.timestamp) as unknown as Comparable,
        minutes(2).ago(),
        minutes(2).fromNow(),
      );
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

constSet(
  (ActionMailbox as unknown as Record<string, Record<string, object>>).Ingresses.Mailgun,
  "InboundEmailsController",
  InboundEmailsController,
);
