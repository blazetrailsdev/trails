import { AbstractController, ActionView, Mime } from "@blazetrails/actionpack";
import {
  camelize,
  classAttribute,
  dasherize,
  humanize,
  isBlank,
  constantize,
  include,
  isAnonymous,
  isPresent,
  Notifications,
  presence,
  underscore,
  type Callbacks as ActiveSupportCallbacks,
  type EventPayload,
  type Included,
} from "@blazetrails/activesupport";
import * as I18n from "@blazetrails/i18n";
import { Address, Mail, type AttachmentsList, type Message, type Part } from "@blazetrails/mail";
import {
  NoMethodError,
  PROTOCOL_PROBES,
  RuntimeError,
  SimpleDelegator,
  rbModName,
} from "@blazetrails/ruby-compat";
import { Collector } from "./collector.js";
import {
  DeliveryMethods,
  type ClassMethods as DeliveryMethodsClassMethods,
  type DeliveryMethodsClass,
} from "./delivery-methods.js";
import { Callbacks } from "./callbacks.js";
import { ActionMailer } from "./namespaces.js";
import {
  Parameterized,
  type ClassMethods as ParameterizedClassMethods,
  type ParameterizedIncluded,
} from "./parameterized.js";
import { QueuedDelivery } from "./queued-delivery.js";
import type { MailDeliveryJob } from "./mail-delivery-job.js";
import { Rescuable } from "./rescuable.js";

type Headers = Record<string, unknown>;
type Response = Record<string, unknown>;
type Template = { format: string | null };

type Observer = Parameters<typeof Mail.registerObserver>[0];
type Interceptor = Parameters<typeof Mail.registerInterceptor>[0];

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the `interface Base` below.
export class Base extends AbstractController.Base {
  declare static NullMail: typeof NullMail;
  declare static prependViewPath: OmitThisParameter<
    typeof ActionView.ViewPaths.ClassMethods.prependViewPath
  >;
  declare static appendViewPath: OmitThisParameter<
    typeof ActionView.ViewPaths.ClassMethods.appendViewPath
  >;
  declare static deliveryMethod: DeliveryMethodsClass["deliveryMethod"];
  declare static deliveryMethods: DeliveryMethodsClass["deliveryMethods"];
  declare static isDeliveryMethods: () => boolean;
  declare static performDeliveries: DeliveryMethodsClass["performDeliveries"];
  declare static raiseDeliveryErrors: DeliveryMethodsClass["raiseDeliveryErrors"];
  declare static deliveries: Message[];
  declare static addDeliveryMethod: typeof DeliveryMethodsClassMethods.addDeliveryMethod;
  /** @internal */
  declare static wrapDeliveryBehavior: typeof DeliveryMethodsClassMethods.wrapDeliveryBehavior;
  declare static defaultParams: Readonly<Record<string, unknown>>;
  declare static deliveryJob: typeof MailDeliveryJob;
  declare static isDeliveryJob: () => boolean;
  declare static deliverLaterQueueName: unknown;
  declare static with: typeof ParameterizedClassMethods.with;

  /** @internal */
  protected static _mailerName?: string;

  static registerObservers(...observers: unknown[]): void {
    for (const observer of observers.flat(Infinity).filter((x) => x != null)) {
      this.registerObserver(observer as Observer | string);
    }
  }

  static unregisterObservers(...observers: unknown[]): void {
    for (const observer of observers.flat(Infinity).filter((x) => x != null)) {
      this.unregisterObserver(observer as Observer | string);
    }
  }

  static registerInterceptors(...interceptors: unknown[]): void {
    for (const interceptor of interceptors.flat(Infinity).filter((x) => x != null)) {
      this.registerInterceptor(interceptor as Interceptor | string);
    }
  }

  static unregisterInterceptors(...interceptors: unknown[]): void {
    for (const interceptor of interceptors.flat(Infinity).filter((x) => x != null)) {
      this.unregisterInterceptor(interceptor as Interceptor | string);
    }
  }

  static registerObserver(observer: Observer | string): void {
    Mail.registerObserver(this.observerClassFor(observer) as Observer);
  }

  static unregisterObserver(observer: Observer | string): void {
    Mail.unregisterObserver(this.observerClassFor(observer) as Observer);
  }

  static registerInterceptor(interceptor: Interceptor | string): void {
    Mail.registerInterceptor(this.observerClassFor(interceptor) as Interceptor);
  }

  static unregisterInterceptor(interceptor: Interceptor | string): void {
    Mail.unregisterInterceptor(this.observerClassFor(interceptor) as Interceptor);
  }

  /** @internal */
  protected static observerClassFor(value: unknown): unknown {
    if (typeof value === "string") {
      return constantize(camelize(value));
    } else {
      return value;
    }
  }

  static mailerName(): string {
    if (!Object.hasOwn(this, "_mailerName") || this._mailerName == null) {
      this._mailerName = isAnonymous(this) ? "anonymous" : underscore(rbModName(this)!);
    }
    return this._mailerName;
  }

  static setMailerName(value: string): void {
    this._mailerName = value;
  }

  static override controllerPath(): string {
    return this.mailerName();
  }

  static default(value: Record<string, unknown> | null = null): Readonly<Record<string, unknown>> {
    if (value != null) this.defaultParams = Object.freeze({ ...this.defaultParams, ...value });
    return this.defaultParams;
  }

  static set defaultOptions(value: Record<string, unknown> | null) {
    this.default(value);
  }

  /** @internal */
  static deliverMail<T>(mail: Message, block: () => T): T {
    return Notifications.instrument("deliver.action_mailer", {}, (payload) => {
      this.setPayloadForMail(payload, mail);
      return block();
    }) as T;
  }

  static emailAddressWithName(address: string, name: string | null): string {
    const builder = new Address();
    builder.setAddress(address);
    builder.setDisplayName(presence(name));
    return builder.toString();
  }

  /** @internal */
  protected static setPayloadForMail(payload: EventPayload, mail: Message): void {
    payload.mail = mail.encoded();
    payload.mailer = rbModName(this);
    payload.messageId = mail.messageId();
    payload.subject = mail.subject();
    payload.to = mail.to();
    payload.from = mail.from();
    if (isPresent(mail.bcc())) payload.bcc = mail.bcc();
    if (isPresent(mail.cc())) payload.cc = mail.cc();
    payload.date = mail.date();
    payload.performDeliveries = mail.performDeliveries;
  }

  /** @internal */
  static methodMissing(methodName: string, ...args: unknown[]): unknown {
    if (this.actionMethods().includes(methodName)) {
      return new ActionMailer.MessageDelivery(this, methodName, ...args);
    } else {
      throw new NoMethodError(
        `undefined method \`${methodName}' for class ${rbModName(this)}`,
        methodName,
      );
    }
  }

  /** @internal */
  static respondToMissing(method: string, _includeAll = false): boolean {
    return this.actionMethods().includes(method);
  }

  /** @internal */
  _mailWasCalled: boolean;
  /** @internal */
  _message: Message | NullMail;

  get message(): Message | NullMail {
    return this._message;
  }
  set message(value: Message | NullMail) {
    this._message = value;
  }

  /** @internal */
  declare _actionHasLayout?: boolean;
  /** @internal */
  declare _renderedFormat: unknown;

  /**
   * @inlinedFrom ActionView::Layouts#initialize rails/v8.0.2/actionview/lib/action_view/layouts.rb:361-364
   * @inlinedFrom ActionView::Rendering#initialize rails/v8.0.2/actionview/lib/action_view/rendering.rb:32-35
   */
  constructor() {
    super();
    this._actionHasLayout = true;
    this._renderedFormat = null;
    this._mailWasCalled = false;
    this._message = Mail.new();
  }

  /**
   * @internal
   * @inlinedFrom ActionMailer::Rescuable#process rails/v8.0.2/actionmailer/lib/action_mailer/rescuable.rb:27-31
   */
  override async process(methodName: string, ...args: unknown[]): Promise<unknown> {
    const payload = {
      mailer: rbModName(this.constructor),
      action: methodName,
      args: args,
    };
    return Notifications.instrument("process.action_mailer", payload, async () => {
      await this.handleExceptions(() => super.process(methodName, ...args));
      if (!this._mailWasCalled) this._message = new NullMail();
    });
  }

  mailerName(): string {
    return (this.constructor as typeof Base).mailerName();
  }

  emailAddressWithName(address: string, name: string | null): string {
    return (this.constructor as typeof Base).emailAddressWithName(address, name);
  }

  headers(args: Headers | null = null): Message | void {
    if (args != null && (args as unknown) !== false) {
      return (this._message as Message).headers(args);
    } else {
      return this._message as Message;
    }
  }

  attachments(): AttachmentsList {
    if (this._mailWasCalled) {
      return new Base.LateAttachmentsProxy((this._message as Message).attachments()) as never;
    } else {
      return (this._message as Message).attachments();
    }
  }

  static LateAttachmentsProxy = class LateAttachmentsProxy extends SimpleDelegator {
    inline(): this {
      return this;
    }

    set(_name: string, _content: unknown): Promise<unknown> {
      return this._raiseError();
    }

    /** @internal */
    _raiseError(): never {
      throw new RuntimeError(
        "Can't add attachments after `mail` was called.\n" +
          "Make sure to use `attachments[]=` before calling `mail`.",
      );
    }
  };

  async mail(headers: Headers = {}, block?: (collector: Collector) => unknown): Promise<Message> {
    if (this._mailWasCalled && isBlank(headers) && !block) return this.message as Message;
    const message = this.message as Message;

    const contentType = headers.contentType;

    headers = this.applyDefaults(headers);

    const charset = (message.charset = headers.charset as string | null);

    this.wrapDeliveryBehaviorBang(headers.deliveryMethod, headers.deliveryMethodOptions);

    this.assignHeadersToMessage(message, headers);

    const responses = await this.collectResponses(headers, block);
    this._mailWasCalled = true;

    this.createPartsFromResponses(message, responses);
    this.wrapInlineAttachments(message);

    message.setContentType(this.setContentType(message, contentType, headers.contentType));
    message.charset = charset;

    if (message.isMultipart()) {
      message.body().setSortOrder(headers.partsOrder as string[]);
      message.body().sortPartsBang();
    }

    return message;
  }

  /** @internal */
  protected setContentType(m: Message, userContentType: unknown, classDefault: unknown): unknown {
    const params = m.contentTypeParameters() ?? {};
    if (isPresent(userContentType)) {
      return userContentType;
    } else if (m.hasAttachments()) {
      if (m.attachments().every((a) => a.isInline())) {
        return ["multipart", "related", params];
      } else {
        return ["multipart", "mixed", params];
      }
    } else if (m.isMultipart()) {
      return ["multipart", "alternative", params];
    } else {
      const contentType = m.contentType();
      return contentType != null && contentType !== false ? contentType : classDefault;
    }
  }

  /** @internal */
  protected defaultI18nSubject(interpolations: Record<string, unknown> = {}): unknown {
    const mailerScope = (this.constructor as typeof Base).mailerName().replaceAll("/", ".");
    return I18n.t("subject", {
      ...interpolations,
      scope: [mailerScope, this.actionName],
      default: humanize(this.actionName),
    });
  }

  /** @internal */
  static override supportsPath(): boolean {
    return false;
  }

  /** @internal */
  protected applyDefaults(headers: Headers): Headers {
    const defaultValues: Headers = {};
    for (const [key, value] of Object.entries((this.constructor as typeof Base).default())) {
      if (!Object.hasOwn(headers, key)) defaultValues[key] = this.computeDefault(value);
    }

    const headersWithDefaults: Headers = { ...defaultValues, ...headers };
    if (headersWithDefaults.subject == null || headersWithDefaults.subject === false) {
      headersWithDefaults.subject = this.defaultI18nSubject();
    }
    return headersWithDefaults;
  }

  /** @internal */
  protected computeDefault(value: unknown): unknown {
    if (typeof value !== "function") return value;

    if (value.length === 1) {
      return value.call(this, this);
    } else {
      return value.call(this);
    }
  }

  /** @internal */
  protected assignHeadersToMessage(message: Message, headers: Headers): void {
    const {
      partsOrder,
      contentType,
      body,
      templateName,
      templatePath,
      deliveryMethod,
      deliveryMethodOptions,
      ...assignable
    } = headers;
    for (const [k, v] of Object.entries(assignable)) message.set(k, v);
  }

  /** @internal */
  protected collectResponses(
    headers: Headers,
    block?: (collector: Collector) => unknown,
  ): Response[] | Promise<Response[]> {
    if (block) {
      return this.collectResponsesFromBlock(headers, block);
    } else if (headers.body != null && headers.body !== false) {
      return this.collectResponsesFromText(headers);
    } else {
      return this.collectResponsesFromTemplates(headers);
    }
  }

  /** @internal */
  protected async collectResponsesFromBlock(
    headers: Headers,
    block: (collector: Collector) => unknown,
  ): Promise<Response[]> {
    const templatesName = (
      headers.templateName != null && headers.templateName !== false
        ? headers.templateName
        : this.actionName
    ) as string;
    const collector = new Collector(this.lookupContext, () => this.render(templatesName));
    await block(collector);
    for (const response of collector.responses) response.body = await response.body;
    return collector.responses;
  }

  /** @internal */
  protected collectResponsesFromText(headers: Headers): Response[] {
    const body = headers.body;
    delete headers.body;
    return [
      {
        body: body,
        contentType:
          headers.contentType != null && headers.contentType !== false
            ? headers.contentType
            : "text/plain",
      },
    ];
  }

  /**
   * @internal
   * @inventedArm underscore — PERMANENT
   * @inventedArm dasherize — PERMANENT
   */
  protected async collectResponsesFromTemplates(headers: Headers): Promise<Response[]> {
    const templatesPath =
      headers.templatePath != null && headers.templatePath !== false
        ? headers.templatePath
        : dasherize((this.constructor as typeof Base).mailerName());
    const templatesName = (
      headers.templateName != null && headers.templateName !== false
        ? headers.templateName
        : dasherize(underscore(this.actionName))
    ) as string;

    const responses: Response[] = [];
    for (const template of this.eachTemplate([templatesPath].flat() as string[], templatesName)) {
      const format = template.format || (this.formats as string[])[0];
      responses.push({
        body: await this.render({ template: template, formats: [format] }),
        contentType: Mime.get(format)!.toString(),
      });
    }
    return responses;
  }

  /** @internal */
  protected *eachTemplate(paths: string[], name: string): Generator<Template> {
    const templates = this.lookupContext.findAll(name, paths) as Template[];
    if (templates.length === 0) {
      throw new ActionView.MissingTemplate(paths as never, name, paths, false, "mailer");
    } else {
      const seen = new Set<string | null>();
      for (const template of templates) {
        if (seen.has(template.format)) continue;
        seen.add(template.format);
        yield template;
      }
    }
  }

  /** @internal */
  protected wrapInlineAttachments(message: Message): void {
    if (
      message.attachments().find((a) => a.isInline()) &&
      message.attachments().find((a) => !a.isInline())
    ) {
      const related = new Mail.Part();
      related.setContentType("multipart/related");
      const mixed: Part[] = [related];

      for (const p of message.parts) {
        if (p.isAttachment() && !p.isInline()) {
          mixed.push(p);
        } else {
          related.addPart(p);
        }
      }

      message.parts.length = 0;
      for (const c of mixed) message.addPart(c);
    }
  }

  /** @internal */
  protected createPartsFromResponses(m: Message, responses: Response[]): void {
    if (responses.length === 1 && !m.hasAttachments()) {
      for (const [k, v] of Object.entries(responses[0])) m.set(k, v);
    } else if (responses.length > 1 && m.hasAttachments()) {
      const container = new Mail.Part();
      container.setContentType("multipart/alternative");
      for (const r of responses) this.insertPart(container, r, m.charset);
      m.addPart(container);
    } else {
      for (const r of responses) this.insertPart(m, r, m.charset);
    }
  }

  /** @internal */
  protected insertPart(container: Message, response: Response, charset: string | null): void {
    if (response.charset == null || response.charset === false) response.charset = charset;
    const part = new Mail.Part(response);
    container.addPart(part);
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- `include Rescuable` (`action_mailer/base.rb:480`). */
export interface Base
  extends Included<typeof Rescuable>, Included<typeof DeliveryMethods>, ParameterizedIncluded {
  readonly lookupContext: ReturnType<typeof ActionView.lookupContext>;
  render: OmitThisParameter<typeof AbstractController.render>;
  runCallbacks: OmitThisParameter<(typeof ActiveSupportCallbacks)["runCallbacks"]>;
}

/** @internal */
export class NullMail {
  constructor() {
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === "symbol" || PROTOCOL_PROBES.has(prop) || Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }
        return (...args: unknown[]) => target.methodMissing(prop, ...args);
      },
    });
  }

  body(): string {
    return "";
  }

  header(): Record<string, unknown> {
    return {};
  }

  isRespondTo(_string: string, _includeAll = false): boolean {
    return true;
  }

  methodMissing(..._args: unknown[]): null {
    return null;
  }
}

Base.NullMail = NullMail;
include(Base, Callbacks);
include(Base, DeliveryMethods);
include(Base, QueuedDelivery);
include(Base, Rescuable);
include(Base, Parameterized);
Base.abstractBang();

include(Base, AbstractController.Rendering);

include(Base, AbstractController.Logger);
include(Base, AbstractController.Helpers);
include(Base, AbstractController.Translation);
include(Base, AbstractController.AssetPaths);
include(Base, AbstractController.Callbacks);
include(Base, AbstractController.Caching);

include(Base, ActionView.Layouts);
classAttribute.call(Base, "defaultParams", {
  default: Object.freeze({
    mimeVersion: "1.0",
    charset: "UTF-8",
    contentType: "text/plain",
    partsOrder: ["text/plain", "text/enriched", "text/html"],
  }),
});
Object.setPrototypeOf(
  Base,
  new Proxy(Object.getPrototypeOf(Base) as object, {
    get(target, prop, receiver: typeof Base) {
      const value = Reflect.get(target, prop, receiver);
      if (
        value !== undefined ||
        typeof prop === "symbol" ||
        Reflect.has(target, prop) ||
        !(receiver === Base || Object.prototype.isPrototypeOf.call(Base, receiver))
      ) {
        return value;
      }
      if (receiver.respondToMissing(prop, false)) {
        return (...args: unknown[]) => receiver.methodMissing(prop, ...args);
      }
      return value;
    },
  }),
);

ActionMailer.Base = Base as typeof ActionMailer.Base;
