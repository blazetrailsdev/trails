import { ArgumentError, TopLevel } from "@blazetrails/ruby-compat";
import { Configuration } from "../../configuration.js";
import { Mail } from "../../mail.js";
import type { Message } from "../../message.js";
import { Retriever, type RetrieverOptions } from "./base.js";

interface NetIMAPFetchData {
  attr: Record<string, unknown>;
}

interface NetIMAPSession {
  starttls(): unknown;
  login(user: unknown, password: unknown): unknown;
  authenticate(mechanism: unknown, ...args: unknown[]): unknown;
  select(mailbox: unknown): unknown;
  examine(mailbox: unknown): unknown;
  uidSearch(keys: unknown, charset?: unknown): number[];
  uidFetch(set: unknown, attr: unknown): NetIMAPFetchData[];
  uidStore(set: unknown, attr: unknown, flags: unknown): unknown;
  expunge(): unknown;
  disconnect(): unknown;
  isDisconnected(): boolean;
}

interface NetIMAPClass {
  new (
    host: unknown,
    port: unknown,
    usessl: unknown,
    certs: unknown,
    verify: unknown,
  ): NetIMAPSession;
  DELETED: string;
  encodeUtf7(s: string): string;
}

type NetWithIMAP = { IMAP?: NetIMAPClass };

type ImapBlock = (message: Message, imap?: unknown, uid?: number, flags?: unknown) => unknown;

export class IMAP extends Retriever {
  settings: Record<string, unknown>;

  constructor(values: Record<string, unknown>) {
    super();
    this.settings = Object.assign(
      {
        address: "localhost",
        port: 143,
        userName: null,
        password: null,
        authentication: null,
        enableSsl: false,
        enableStarttls: false,
      },
      values,
    );
  }

  find(options: RetrieverOptions | null = null, block?: ImapBlock): unknown {
    const opts = this.validateOptions(options);

    return this.start(undefined, (imap) => {
      if (opts.readOnly) imap.examine(opts.mailbox);
      else imap.select(opts.mailbox);
      let uids = imap.uidSearch(opts.keys, opts.searchCharset);
      if (String(opts.what) === "last") uids.reverse();
      if (Number.isInteger(opts.count)) uids = uids.slice(0, opts.count as number);
      if (
        (String(opts.what) === "last" && String(opts.order) === "asc") ||
        (String(opts.what) !== "last" && String(opts.order) === "desc")
      ) {
        uids.reverse();
      }

      if (block) {
        for (let uid of uids) {
          if (opts.uid != null) uid = Number.parseInt(String(opts.uid), 10);
          const fetchdata = imap.uidFetch(uid, ["RFC822", "FLAGS"])[0];
          const newMessage = Mail.new(fetchdata.attr["RFC822"]);
          if (opts.deleteAfterFind) newMessage.setMarkForDelete(true);

          if (block.length === 4) {
            block(newMessage, imap, uid, fetchdata.attr["FLAGS"]);
          } else if (block.length === 3) {
            block(newMessage, imap, uid);
          } else {
            block(newMessage);
          }

          if (opts.deleteAfterFind && newMessage.isMarkedForDelete()) {
            imap.uidStore(uid, "+FLAGS", [(TopLevel.Net as NetWithIMAP).IMAP!.DELETED]);
          }
          if (opts.uid != null) break;
        }
        if (opts.deleteAfterFind) imap.expunge();
        return undefined;
      } else {
        const emails: Message[] = [];
        for (let uid of uids) {
          if (opts.uid != null) uid = Number.parseInt(String(opts.uid), 10);
          const fetchdata = imap.uidFetch(uid, ["RFC822"])[0];
          emails.push(Mail.new(fetchdata.attr["RFC822"]));
          if (opts.deleteAfterFind)
            imap.uidStore(uid, "+FLAGS", [(TopLevel.Net as NetWithIMAP).IMAP!.DELETED]);
          if (opts.uid != null) break;
        }
        if (opts.deleteAfterFind) imap.expunge();
        return emails.length === 1 && opts.count === 1 ? emails[0] : emails;
      }
    });
  }

  deleteAll(mailbox: string | null = "INBOX"): unknown {
    mailbox ??= "INBOX";
    mailbox = (TopLevel.Net as NetWithIMAP).IMAP!.encodeUtf7(mailbox);

    return this.start(undefined, (imap) => {
      imap.select(mailbox);
      for (const uid of imap.uidSearch(["ALL"])) {
        imap.uidStore(uid, "+FLAGS", [(TopLevel.Net as NetWithIMAP).IMAP!.DELETED]);
      }
      return imap.expunge();
    });
  }

  connection(block?: (imap: NetIMAPSession) => unknown): unknown {
    if (!block) throw new ArgumentError("Mail::Retrievable#connection takes a block");

    return this.start(undefined, (imap) => block(imap));
  }

  /** @internal */
  private validateOptions(options: RetrieverOptions | null): RetrieverOptions {
    options = options ? { ...options } : {};
    options.mailbox ||= "INBOX";
    options.count ||= 10;
    options.order ||= "asc";
    options.what ||= "first";
    options.keys ||= "ALL";
    options.uid ||= null;
    options.deleteAfterFind ||= false;
    options.mailbox = (TopLevel.Net as NetWithIMAP).IMAP!.encodeUtf7(options.mailbox as string);
    options.readOnly ||= false;

    return options;
  }

  /** @internal */
  private start<T>(
    // eslint-disable-next-line unused-imports/no-unused-vars
    config: Configuration = Configuration.instance(),
    block?: (imap: NetIMAPSession) => T,
  ): T {
    let imap: NetIMAPSession | null = null;
    try {
      if (!block) throw new ArgumentError("Mail::Retrievable#imap_start takes a block");

      if (this.settings.enableStarttls && this.settings.enableSsl) {
        throw new ArgumentError(
          ":enable_starttls and :enable_ssl are mutually exclusive. Set :enable_ssl if you're on an IMAPS connection. Set :enable_starttls if you're on an IMAP connection and using STARTTLS for secure TLS upgrade.",
        );
      }

      imap = new (TopLevel.Net as NetWithIMAP).IMAP!(
        this.settings.address,
        this.settings.port,
        this.settings.enableSsl,
        null,
        false,
      );

      if (this.settings.enableStarttls) imap.starttls();

      if (this.settings.authentication == null) {
        imap.login(this.settings.userName, this.settings.password);
      } else {
        imap.authenticate(
          this.settings.authentication,
          this.settings.userName,
          this.settings.password,
        );
      }

      return block(imap);
    } finally {
      if (imap && !imap.isDisconnected()) {
        imap.disconnect();
      }
    }
  }
}

Mail.IMAP = IMAP;
