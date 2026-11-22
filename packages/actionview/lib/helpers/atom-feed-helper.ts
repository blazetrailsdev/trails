import { Time } from "@blazetrails/date";
import {
  NameError,
  PROTOCOL_PROBES,
  defineModule,
  isPlainHash,
  rbModName,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import type { XmlBase } from "@blazetrails/builder";

type Block<T> = (builder: T) => unknown;

type XmlSchemaValue = { xmlschema(): string };

interface AtomFeedOptions {
  schemaDate?: { strftime(format: string): string } | string | null | false;
  xml?: XmlBase;
  instruct?: Record<string, unknown> | null | false;
  language?: string | null;
  id?: string | null;
  rootUrl?: string | null;
  url?: string | false | null;
  published?: XmlSchemaValue | null;
  updated?: XmlSchemaValue | null;
  type?: string;
  [key: string]: unknown;
}

interface AtomRequest {
  host: string;
  fullpath: string;
  protocol: string;
  url: string;
  hostWithPort(): string;
}

export interface AtomFeedHelperHost {
  request: AtomRequest;
  polymorphicUrl(record: unknown, options?: Record<string, unknown>): string;
}

interface AtomRecord {
  id: unknown;
  createdAt?: XmlSchemaValue | null;
  updatedAt?: XmlSchemaValue | null;
}

export function atomFeed(
  this: AtomFeedHelperHost,
  options: AtomFeedOptions = {},
  block: Block<AtomFeedBuilder>,
): unknown {
  if (typeof options === "function") [options, block] = [{}, options];
  if (options.schemaDate != null && options.schemaDate !== false) {
    if (rbObjRespondTo(options.schemaDate, "strftime"))
      options.schemaDate = (options.schemaDate as { strftime(format: string): string }).strftime(
        "%Y-%m-%d",
      );
  } else {
    options.schemaDate = "2005";
  }

  const deleted = options.xml;
  delete options.xml;
  /** @missingRailsCall localVariableGet — PERMANENT */
  const xml: XmlBase =
    deleted ??
    (() => {
      throw new NameError("local variable `xml' is not defined for #<Binding>");
    })();
  xml.instructBang();
  if (options.instruct != null && options.instruct !== false) {
    for (const [target, attrs] of Object.entries(options.instruct)) {
      if (isPlainHash(attrs) || attrs instanceof Map) {
        xml.instructBang(target, attrs instanceof Map ? Object.fromEntries(attrs) : attrs);
      } else if (Array.isArray(attrs) || rbObjRespondTo(attrs, "each")) {
        for (const attrGroup of attrs as Iterable<Record<string, unknown>>)
          xml.instructBang(target, attrGroup);
      }
    }
  }

  const feedOpts: Record<string, unknown> = {
    "xml:lang": options.language != null ? options.language : "en-US",
    xmlns: "http://www.w3.org/2005/Atom",
  };
  Object.assign(feedOpts, options);
  for (const k of Object.keys(feedOpts)) if (!k.startsWith("xml")) delete feedOpts[k];

  return xml.feed(feedOpts, () => {
    xml.id(
      options.id != null
        ? options.id
        : `tag:${this.request.host},${options.schemaDate}:${this.request.fullpath.split(".")[0]}`,
    );
    xml.link({
      rel: "alternate",
      type: "text/html",
      href:
        options.rootUrl != null
          ? options.rootUrl
          : this.request.protocol + this.request.hostWithPort(),
    });
    xml.link({
      rel: "self",
      type: "application/atom+xml",
      href: options.url != null && options.url !== false ? options.url : this.request.url,
    });

    return block(new AtomFeedBuilder(xml, this, options));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AtomBuilder {
  static readonly XHTML_TAG_NAMES = new Set(["content", "rights", "title", "subtitle", "summary"]);

  protected _xml: XmlBase;

  constructor(xml: XmlBase) {
    this._xml = xml;
  }

  /** @internal */
  methodMissing(method: string, ...arguments_: unknown[]): unknown {
    const block =
      typeof arguments_.at(-1) === "function" ? (arguments_.pop() as Block<XmlBase>) : null;
    if (this.isXhtmlBlock(method, arguments_)) {
      return this._xml[method](...arguments_, () =>
        this._xml.div({ xmlns: "http://www.w3.org/1999/xhtml" }, (xhtml: XmlBase) => block!(xhtml)),
      );
    } else {
      return this._xml[method](...arguments_, ...(block ? [block] : []));
    }
  }

  /** @internal */
  private isXhtmlBlock(method: string, arguments_: unknown[]): boolean | undefined {
    if (AtomBuilder.XHTML_TAG_NAMES.has(method)) {
      const last = arguments_.at(-1);
      return isPlainHash(last) && String((last as { type?: unknown }).type) === "xhtml";
    }
    return undefined;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AtomBuilder {
  [tag: string]: unknown;
}

Object.setPrototypeOf(
  AtomBuilder.prototype,
  new Proxy(Object.create(Object.prototype) as object, {
    get(target, prop, receiver: AtomBuilder) {
      if (typeof prop === "symbol" || prop in target || PROTOCOL_PROBES.has(prop)) {
        return Reflect.get(target, prop, receiver);
      }
      return (...args: unknown[]) => receiver.methodMissing(prop, ...args);
    },
  }),
);

export class AtomFeedBuilder extends AtomBuilder {
  protected _view: AtomFeedHelperHost;
  protected _feedOptions: AtomFeedOptions;

  constructor(xml: XmlBase, view: AtomFeedHelperHost, feedOptions: AtomFeedOptions = {}) {
    super(xml);
    [this._xml, this._view, this._feedOptions] = [xml, view, feedOptions];
  }

  updated(dateOrTime: XmlSchemaValue | null = null): unknown {
    return this._xml.updated((dateOrTime || Time.now().utc()).xmlschema());
  }

  entry(record: AtomRecord, options: AtomFeedOptions = {}, block: Block<AtomBuilder>): unknown {
    if (typeof options === "function") [options, block] = [{}, options];
    return this._xml.entry(() => {
      this._xml.id(
        options.id != null
          ? options.id
          : `tag:${this._view.request.host},${this._feedOptions.schemaDate}:${rbModName(record.constructor)}/${record.id}`,
      );

      if (options.published || (rbObjRespondTo(record, "createdAt") && record.createdAt)) {
        this._xml.published((options.published || record.createdAt)!.xmlschema());
      }

      if (options.updated || (rbObjRespondTo(record, "updatedAt") && record.updatedAt)) {
        this._xml.updated((options.updated || record.updatedAt)!.xmlschema());
      }

      const type = Object.hasOwn(options, "type") ? options.type : "text/html";

      const url = Object.hasOwn(options, "url") ? options.url : this._view.polymorphicUrl(record);
      if (url != null && url !== false) this._xml.link({ rel: "alternate", type: type, href: url });

      return block(new AtomBuilder(this._xml));
    });
  }
}

export const AtomFeedHelper = defineModule({ atomFeed });
