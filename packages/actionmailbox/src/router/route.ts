import { camelize, constantize } from "@blazetrails/activesupport";
import { ArgumentError, rbInspect, rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { InboundEmail } from "../inbound-email.js";

export type RouteAddress =
  | string
  | RegExp
  | ((inboundEmail: InboundEmail) => unknown)
  | { isMatch(inboundEmail: InboundEmail): unknown };

export class Route {
  readonly address: RouteAddress;
  readonly mailboxName: string;

  constructor(address: RouteAddress, { to }: { to: string }) {
    [this.address, this.mailboxName] = [address, to];

    this.ensureValidAddress();
  }

  async isMatch(inboundEmail: InboundEmail): Promise<unknown> {
    const address = this.address;
    if (address === ":all") {
      return true;
    } else if (typeof address === "string") {
      return (await inboundEmail.mail())
        .recipients()
        .some((recipient) => address.toLowerCase() === (recipient as string).toLowerCase());
    } else if (address instanceof RegExp) {
      return (await inboundEmail.mail())
        .recipients()
        .some((recipient) => (recipient as string).search(address) !== -1);
    } else if (typeof address === "function") {
      return await address(inboundEmail);
    } else {
      return await address.isMatch(inboundEmail);
    }
  }

  mailboxClass(): unknown {
    return constantize(`${camelize(String(this.mailboxName))}Mailbox`);
  }

  /** @internal */
  private ensureValidAddress(): void {
    const address: unknown = this.address;
    if (
      !(
        typeof address === "string" ||
        address instanceof RegExp ||
        typeof address === "function" ||
        rbObjRespondTo(address, "isMatch")
      )
    ) {
      throw new ArgumentError(
        `Expected a Symbol, String, Regexp, Proc, or matchable, got ${rbInspect(address)}`,
      );
    }
  }
}
