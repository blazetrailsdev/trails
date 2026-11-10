import { TopLevel } from "@blazetrails/ruby-compat";
import "@blazetrails/net-smtp";

export class MockPopMail {
  private rfc2822: string;
  readonly number: number;
  private deleted: boolean;

  constructor(rfc2822: string, number: number) {
    this.rfc2822 = rfc2822;
    this.number = number;
    this.deleted = false;
  }

  pop(): string {
    return this.rfc2822;
  }

  toString(): string {
    return `${this.number}: ${this.pop()}`;
  }

  delete(): void {
    this.deleted = true;
  }

  isDeleted(): boolean {
    return this.deleted;
  }
}

let start = false;
let popmails: MockPopMail[] = [];

export class MockPOP3 {
  readTimeout: unknown = null;

  constructor() {
    popmails = [];
    for (let i = 0; i < 20; i++) {
      popmails.push(new MockPopMail(`test${String(i).padStart(2, "0")}`, i));
    }
  }

  static popmails(): MockPopMail[] {
    return [...popmails];
  }

  eachMail(...args: unknown[]): void {
    const block = args.at(-1) as (popmail: MockPopMail) => void;
    for (const popmail of popmails) block(popmail);
  }

  mails(..._args: unknown[]): MockPopMail[] {
    return [...popmails];
  }

  start(..._args: unknown[]): this {
    start = true;
    return this;
  }

  enableSsl(..._args: unknown[]): boolean {
    return true;
  }

  isStarted(): boolean {
    return start === true;
  }

  static isStarted(): boolean {
    return start === true;
  }

  reset(): void {}

  finish(): void {
    start = false;
  }

  deleteAll(): void {
    popmails = [];
  }
}

export class NetPOP3 {
  static new(..._args: unknown[]): MockPOP3 {
    return new MockPOP3();
  }

  constructor(..._args: unknown[]) {
    return NetPOP3.new(..._args);
  }
}

(TopLevel.Net as { POP3?: unknown }).POP3 = NetPOP3;
