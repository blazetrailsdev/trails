import { arySlice, rbInspect, RuntimeError } from "@blazetrails/ruby-compat";
import { Mail } from "../../mail.js";
import type { Message } from "../../message.js";
import { Retriever, type RetrieverOptions } from "./base.js";

let _emails: Message[] = [];

export class TestRetriever extends Retriever {
  static get emails(): Message[] {
    return _emails;
  }

  static set emails(val: Message[]) {
    _emails = val;
  }

  constructor(_values: Record<string, unknown>) {
    super();
    _emails = [];
  }

  find(options: RetrieverOptions | null = null, block?: (email: Message) => unknown): unknown {
    options = options ? { ...options } : {};
    options.count ??= "all";
    options.order ??= "asc";
    options.what ??= "first";
    let emailsIndex: number[] = Array.from({ length: _emails.length }, (_, i) => i);
    if (options.what === "last") emailsIndex.reverse();
    const count = options.count;
    if (Number.isInteger(count)) {
      emailsIndex = arySlice(emailsIndex, 0, count) as number[];
    } else if (count !== "all") {
      throw new RuntimeError("Invalid count option value: " + rbInspect(count));
    }
    if (
      (options.what === "last" && options.order === "asc") ||
      (options.what === "first" && options.order === "desc")
    ) {
      emailsIndex.reverse();
    }
    if (options.deleteAfterFind) emailsIndex.forEach((idx) => _emails[idx].setMarkForDelete(true));
    const emails = emailsIndex.map((idx) => _emails[idx]);
    if (block) emails.forEach((email) => block(email));
    if (options.deleteAfterFind) _emails = _emails.filter((email) => !email.isMarkedForDelete());
    return emails.length === 1 && options.count === 1 ? emails[0] : emails;
  }
}

Mail.TestRetriever = TestRetriever;
