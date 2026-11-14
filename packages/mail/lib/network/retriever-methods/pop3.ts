import { ArgumentError, OpenSSL, rbAryFirst, TopLevel } from "@blazetrails/ruby-compat";
import { Configuration } from "../../configuration.js";
import { Mail } from "../../mail.js";
import type { Message } from "../../message.js";
import { Retriever, type RetrieverOptions } from "./base.js";

interface NetPOPMail {
  number: number;
  pop(): string;
  delete(): unknown;
}

interface NetPOP3Session {
  readTimeout: unknown;
  mails(): NetPOPMail[];
  reset(): unknown;
  deleteAll(): unknown;
  enableSsl(verify: unknown): unknown;
  start(account: unknown, password: unknown): unknown;
  finish(): unknown;
  isStarted(): boolean;
}

interface NetPOP3Class {
  new (addr: unknown, port: unknown, isapop: unknown): NetPOP3Session;
}

type NetWithPOP3 = { POP3?: NetPOP3Class };

export class POP3 extends Retriever {
  settings: Record<string, unknown>;

  constructor(values: Record<string, unknown>) {
    super();
    this.settings = Object.assign(
      {
        address: "localhost",
        port: 110,
        userName: null,
        password: null,
        authentication: null,
        enableSsl: false,
        readTimeout: null,
      },
      values,
    );
  }

  find(options: RetrieverOptions | null = null, block?: (email: Message) => unknown): unknown {
    const opts = this.validateOptions(options);

    return this.start(undefined, (pop3) => {
      let mails = pop3.mails();
      pop3.reset();
      if (opts.what === "last") mails.sort((m1, m2) => m2.number - m1.number);
      if (Number.isInteger(opts.count)) mails = rbAryFirst(mails, opts.count as number);

      if (
        !(
          (String(opts.what) === "last" && String(opts.order) === "desc") ||
          (String(opts.what) === "first" && String(opts.order) === "asc")
        )
      ) {
        mails.reverse();
      }

      if (block) {
        for (const mail of mails) {
          const newMessage = Mail.new(mail.pop());
          if (opts.deleteAfterFind != null && opts.deleteAfterFind !== false)
            newMessage.setMarkForDelete(true);
          block(newMessage);
          if (
            opts.deleteAfterFind != null &&
            opts.deleteAfterFind !== false &&
            newMessage.isMarkedForDelete()
          )
            mail.delete();
        }
        return mails;
      } else {
        const emails: Message[] = [];
        for (const mail of mails) {
          emails.push(Mail.new(mail.pop()));
          if (opts.deleteAfterFind != null && opts.deleteAfterFind !== false) mail.delete();
        }
        return emails.length === 1 && opts.count === 1 ? emails[0] : emails;
      }
    });
  }

  deleteAll(): unknown {
    return this.start(undefined, (pop3) => {
      if (pop3.mails().length !== 0) {
        pop3.deleteAll();
        return pop3.finish();
      }
      return null;
    });
  }

  connection(block?: (pop3: NetPOP3Session) => unknown): unknown {
    if (!block) throw new ArgumentError("Mail::Retrievable#connection takes a block");

    return this.start(undefined, (pop3) => block(pop3));
  }

  /** @internal */
  private validateOptions(options: RetrieverOptions | null): RetrieverOptions {
    options = options ? { ...options } : {};
    options.count ??= 10;
    options.order ??= "asc";
    options.what ??= "first";
    if (options.deleteAfterFind == null) options.deleteAfterFind = false;
    return options;
  }

  /** @internal */
  private start<T>(
    // eslint-disable-next-line unused-imports/no-unused-vars
    config: Configuration = Configuration.instance(),
    block?: (pop3: NetPOP3Session) => T,
  ): T {
    let pop3: NetPOP3Session | null = null;
    try {
      if (!block) throw new ArgumentError("Mail::Retrievable#pop3_start takes a block");

      pop3 = new (TopLevel.Net as NetWithPOP3).POP3!(
        this.settings.address,
        this.settings.port,
        false,
      );
      if (this.settings.enableSsl != null && this.settings.enableSsl !== false)
        pop3.enableSsl(OpenSSL.SSL.VERIFY_NONE);
      if (this.settings.readTimeout != null && this.settings.readTimeout !== false)
        pop3.readTimeout = this.settings.readTimeout;
      pop3.start(this.settings.userName, this.settings.password);

      return block(pop3);
    } finally {
      if (pop3 && pop3.isStarted()) {
        pop3.finish();
      }
    }
  }
}

Mail.POP3 = POP3;
