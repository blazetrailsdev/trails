import { AbstractController } from "@blazetrails/actionpack";
import { extractOptionsBang, include, reverseMergeBang } from "@blazetrails/activesupport";
import { ArgumentError, rbFSend } from "@blazetrails/ruby-compat";
import { ActionMailer } from "./namespaces.js";

type Block = () => unknown;

export class Collector {
  /** @internal */
  _context: { formats: unknown };
  /** @internal */
  _responses: Record<string, unknown>[];
  /** @internal */
  _defaultRender: Block;

  get responses(): Record<string, unknown>[] {
    return this._responses;
  }

  constructor(context: { formats: unknown }, block: Block) {
    this._context = context;
    this._responses = [];
    this._defaultRender = block;
  }

  /** @inventedArm if — PERMANENT */
  any(...args: unknown[]): unknown[] {
    const block = typeof args[args.length - 1] === "function" ? (args.pop() as Block) : undefined;
    const options = extractOptionsBang(args);
    if (args.length === 0) throw new ArgumentError("You have to supply at least one format");
    for (const type of args) rbFSend(this, type as string, { ...options }, block);
    return args;
  }

  declare all: Collector["any"];

  /** @inventedArm if — PERMANENT */
  custom(
    mime: { toString(): string; toSym(): string | null },
    options: Record<string, unknown> | Block = {},
    block?: Block,
  ): Record<string, unknown>[] {
    if (typeof options === "function") {
      block = options;
      options = {};
    }
    reverseMergeBang(options, { contentType: mime.toString() });
    this._context.formats = [mime.toSym()];
    options.body = block ? block() : this._defaultRender();
    this._responses.push(options);
    return this._responses;
  }
}

Collector.prototype.all = Collector.prototype.any;

include(Collector, AbstractController.Collector);

ActionMailer.Collector = Collector;
