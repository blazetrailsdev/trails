import { TopLevel } from "@blazetrails/ruby-compat";
import "@blazetrails/net-smtp";

export class MockIMAPFetchData {
  attr: Record<string, unknown>;
  number: number;

  constructor(rfc822: string, number: number, flag: string) {
    this.attr = { RFC822: rfc822, FLAGS: flag };
    this.number = number;
  }
}

let connection = false;
let mailbox: string | null = null;
let readonly = false;
let markedForDeletion: number[] = [];
const defaultExamples: Record<string, MockIMAPFetchData[]> = {
  default: Array.from(
    { length: 20 },
    (_, i) => new MockIMAPFetchData(`test${String(i).padStart(2, "0")}`, i, `DummyFlag${i}`),
  ),
};
defaultExamples["UTF-8"] = defaultExamples.default.slice(0, 1);
let examples: Record<string, MockIMAPFetchData[]> = {};

export class MockIMAP {
  static examples(charset: string | null = null): MockIMAPFetchData[] {
    return examples[charset ?? "default"];
  }

  constructor() {
    examples = {
      default: [...defaultExamples.default],
      "UTF-8": [...defaultExamples["UTF-8"]],
    };
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  login(user: unknown, password: unknown): void {
    connection = true;
  }

  authenticate(..._args: unknown[]): void {}

  starttls(): void {}

  disconnect(): void {
    connection = false;
  }

  select(mb: string): void {
    mailbox = mb;
    readonly = false;
  }

  examine(mb: string): void {
    this.select(mb);
    readonly = true;
  }

  uidSearch(keys: unknown, charset: string | null = null): number[] {
    return Array.from({ length: MockIMAP.examples(charset).length }, (_, i) => i);
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  uidFetch(set: number, attr: unknown): MockIMAPFetchData[] {
    return [MockIMAP.examples()[set]];
  }

  uidStore(set: number, attr: string, flags: string[]): void {
    if (attr === "+FLAGS" && flags.includes(NetIMAP.DELETED)) {
      markedForDeletion.push(set);
    }
  }

  expunge(): void {
    for (const i of [...markedForDeletion].reverse()) {
      MockIMAP.examples().splice(i, 1);
    }
    markedForDeletion = [];
  }

  static mailbox(): string | null {
    return mailbox;
  }

  static isReadonly(): boolean {
    return readonly;
  }

  static isDisconnected(): boolean {
    return connection === false;
  }

  isDisconnected(): boolean {
    return connection === false;
  }
}

export class NetIMAP {
  static DELETED = "Deleted";

  static new(..._args: unknown[]): MockIMAP {
    return new MockIMAP();
  }

  constructor(..._args: unknown[]) {
    return NetIMAP.new(..._args);
  }

  static encodeUtf7(s: string): string {
    return s.replace(/(&)|[^\x20-\x7e]+/g, (m, amp) => {
      if (amp) return "&-";
      const bytes: number[] = [];
      for (const ch of m) {
        const cp = ch.codePointAt(0)!;
        const units =
          cp > 0xffff ? [0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff)] : [cp];
        for (const u of units) bytes.push(u >> 8, u & 0xff);
      }
      return (
        "&" +
        btoa(String.fromCharCode(...bytes))
          .replace(/=+$/, "")
          .replace(/\//g, ",") +
        "-"
      );
    });
  }
}

(TopLevel.Net as { IMAP?: unknown }).IMAP = NetIMAP;
