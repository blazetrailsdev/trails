import type { Request } from "@blazetrails/actionpack";
import {
  SecurityUtils,
  TopLevel,
  isPresent,
  squish,
  type Logger,
} from "@blazetrails/activesupport";
import { ArgumentError, Base64, JSON, OpenSSL, env, flatten, sort } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "../../action-mailbox.js";
import { BaseController } from "../../base-controller.js";

export class InboundEmailsController extends BaseController {
  static {
    this.beforeAction(":authenticate", { except: "healthCheck" });
  }

  async create(): Promise<void> {
    try {
      for (const rawEmail of this.rawEmails()) {
        await ActionMailbox.InboundEmail.createAndExtractMessageIdBang(rawEmail);
      }
      this.head(":ok");
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      (this as unknown as { logger?: Logger }).logger?.error(error.message);
      this.head(":unprocessable_entity");
    }
  }

  healthCheck(): void {
    this.head(":ok");
  }

  /** @internal */
  private rawEmails(): string[] {
    return this.events()
      .filter((event) => event["event"] === "inbound")
      .map((event) => (event["msg"] as Record<string, unknown> | null)?.["raw_msg"] as string);
  }

  /** @internal */
  private events(): Record<string, unknown>[] {
    return JSON.parse(this.params.require("mandrill_events") as string) as Record<
      string,
      unknown
    >[];
  }

  /** @internal */
  private async authenticate(): Promise<void> {
    if (!(await this.isAuthenticated())) this.head(":unauthorized");
  }

  /** @internal */
  private async isAuthenticated(): Promise<boolean> {
    const key = await this.key();
    if (isPresent(key)) {
      return new InboundEmailsController.Authenticator(this.request, key!).isAuthenticated();
    } else {
      throw new ArgumentError(
        squish(`
          Missing required Mandrill API key. Set action_mailbox.mandrill_api_key in your application's
          encrypted credentials or provide the MANDRILL_INGRESS_API_KEY environment variable.
        `),
      );
    }
  }

  /** @internal */
  private async key(): Promise<string | null | undefined> {
    const credential = (await TopLevel.Trails!.application!.credentials()).dig(
      "action_mailbox",
      "mandrill_api_key",
    ) as string | false | null | undefined;
    return credential != null && credential !== false ? credential : env.MANDRILL_INGRESS_API_KEY;
  }

  static Authenticator = class Authenticator {
    readonly request: Request;
    readonly key: string;

    constructor(request: Request, key: string) {
      [this.request, this.key] = [request, key];
    }

    isAuthenticated(): boolean {
      return SecurityUtils.secureCompare(this.givenSignature(), this.expectedSignature());
    }

    /** @internal */
    givenSignature(): string {
      return this.request.headers.get("X-Mandrill-Signature") as string;
    }

    /** @internal */
    expectedSignature(): string {
      return Base64.strictEncode64(
        OpenSSL.HMAC.digest(OpenSSL.Digest.SHA1.new(), this.key, this.message()),
      );
    }

    /**
     * @internal
     * @missingRailsArgs join — PERMANENT
     */
    message(): string {
      return this.request.url + flatten(sort(Object.entries(this.request.POST()))).join("");
    }
  };
}

ActionMailbox.Ingresses.Mandrill.InboundEmailsController = InboundEmailsController;
