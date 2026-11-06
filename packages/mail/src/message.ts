import {
  cmp,
  flatten,
  NoMethodError,
  rbObjAsString,
  rbObjDup,
  rbObjId,
  strip,
  stringSplit,
  warn,
  File,
  IO,
  Exception,
  StandardError,
  rtest,
  constGet,
  eachPair,
  Hash,
  hashAref,
  hashDelete,
  NameError,
  rbObjInstanceVariables,
  rbObjIvarGet,
  rbObjIvarSet,
  rbDeclareIvar,
  TopLevel,
} from "@blazetrails/ruby-compat";
import { toYaml } from "@blazetrails/ruby-compat/yaml";
import { Body } from "./body.js";
import { Configuration } from "./configuration.js";
import * as Constants from "./constants.js";
import type { AttachmentsList } from "./attachments-list.js";
import { Encodings } from "./encodings.js";
import type { TransferEncoding } from "./encodings/transfer-encoding.js";
import type { ContentDispositionField } from "./fields/content-disposition-field.js";
import type { ContentLocationField } from "./fields/content-location-field.js";
import type { ParameterHash } from "./fields/parameter-hash.js";
import { ContentTypeField } from "./fields/content-type-field.js";
import type { Part } from "./part.js";
import { Envelope } from "./envelope.js";
import { Field } from "./field.js";
import { Header } from "./header.js";
import { IndifferentHash } from "./indifferent-hash.js";
import { Mail } from "./mail.js";
import type { PartsList } from "./parts-list.js";
import { Utilities } from "./utilities.js";
import { YAML as MailYAML } from "./yaml.js";

type MessageBlock = ((this: Message, message: Message) => unknown) | undefined;

const MULTIPART_CONVERSION_CONTENT_FIELDS = [
  ["contentDescription", "setContentDescription"],
  ["contentDisposition", "setContentDisposition"],
  ["contentTransferEncoding", "setContentTransferEncoding"],
  ["contentType", "setContentType"],
] as const;

let defaultCharset = "UTF-8";

const present = (v: unknown): boolean => v != null && v !== false;

export class Message {
  protected _body: Body | null = null;
  protected _bodyRaw: string | null = null;
  protected _separateParts = false;
  protected _textPart: Message | null = null;
  protected _htmlPart: Message | null = null;
  /** @internal */
  protected _errors: unknown = null;
  protected _header: Header | null = null;
  protected _charset: string | null;
  protected _defaultedCharset = true;
  protected _smtpEnvelopeFrom: unknown = null;
  protected _smtpEnvelopeTo: unknown = null;
  performDeliveries = true;
  raiseDeliveryErrors = true;
  deliveryHandler: unknown = null;
  /** @internal */
  _deliveryMethod: unknown = null;
  protected _transportEncoding: unknown;
  protected _markForDelete = false;
  protected _rawSource = "";
  protected _rawEnvelope: unknown = null;
  protected _envelope: Envelope | null = null;
  protected _deliveryStatusPart: Part | null | undefined;
  protected _attachment: unknown = undefined;

  static get defaultCharset(): string {
    return defaultCharset;
  }

  static set defaultCharset(charset: string) {
    defaultCharset = charset;
  }

  constructor(...args: unknown[]) {
    const block = (typeof args.at(-1) === "function" ? args.pop() : undefined) as MessageBlock;
    this._charset = (this.constructor as typeof Message).defaultCharset;
    this._deliveryMethod = rbObjDup(Mail.deliveryMethod());

    this._transportEncoding = Encodings.getEncoding("7bit");

    const first = flatten(args)[0];
    if (typeof first === "object" && first !== null && !(first instanceof Body)) {
      this.initWithHash(first as Record<string, unknown>);
    } else {
      this.initWithString(rbObjAsString(first ?? ""));
    }

    if (block !== undefined) {
      if (block.length === 0) {
        block.call(this, this);
      } else {
        block.call(this, this);
      }
    }
  }

  informObservers(): void {
    Mail.informObservers(this);
  }

  informInterceptors(): void {
    Mail.informInterceptors(this);
  }

  async deliver(): Promise<this> {
    this.informInterceptors();
    if (this.deliveryHandler != null && this.deliveryHandler !== false) {
      await (
        this.deliveryHandler as { deliverMail(mail: Message, block: () => unknown): unknown }
      ).deliverMail(this, () => this.doDelivery());
    } else {
      await this.doDelivery();
    }
    this.informObservers();
    return this;
  }

  async deliverBang(): Promise<unknown> {
    this.informInterceptors();
    const deliveryMethod = this._deliveryMethod as {
      deliverBang(mail: Message): Promise<unknown>;
      settings: Record<string, unknown>;
    };
    const response = await deliveryMethod.deliverBang(this);
    this.informObservers();
    return rtest(deliveryMethod.settings.returnResponse) ? response : this;
  }

  deliveryMethod(method: unknown = null, settings: Record<string, unknown> = {}): unknown {
    if (method == null || method === false) {
      return this._deliveryMethod;
    } else {
      const klass = Configuration.instance().lookupDeliveryMethod(method) as new (
        settings: Record<string, unknown>,
      ) => unknown;
      return (this._deliveryMethod = new klass(settings));
    }
  }

  reply(...args: unknown[]): Message {
    const block = (typeof args.at(-1) === "function" ? args.pop() : undefined) as MessageBlock;
    const reply = new (this.constructor as typeof Message)();
    if (present(this.messageId())) {
      const bracketedMessageId = `<${this.messageId()}>`;
      reply.setInReplyTo(bracketedMessageId);
      if (this.references() != null) {
        const refs = flatten([this.references()]).map((r) => `<${r}>`);
        refs.push(bracketedMessageId);
        reply.setReferences(refs.join(" "));
      } else if (this.inReplyTo() != null && !Array.isArray(this.inReplyTo())) {
        reply.setReferences(`<${this.inReplyTo()}> ${bracketedMessageId}`);
      }
      if (!present(reply.references())) reply.setReferences(bracketedMessageId);
    }
    if (present(this.subject())) {
      const subject = this.subject();
      reply.setSubject(/^Re:/im.test(subject as string) ? subject : `Re: ${subject}`);
    }
    if (present(this.replyTo()) || present(this.from())) {
      reply.setTo(rbObjAsString(this.get(present(this.replyTo()) ? "reply_to" : "from")));
    }
    if (present(this.to())) {
      reply.setFrom(
        rbObjAsString((this.get("to") as unknown as { formatted(): unknown[] }).formatted()[0]),
      );
    }
    if (args.length > 0) {
      const first = flatten(args)[0];
      if (typeof first === "object" && first !== null) {
        reply.initWithHash(first as Record<string, unknown>);
      } else {
        reply.initWithString(strip(rbObjAsString(first ?? "")));
      }
    }
    if (block !== undefined) block.call(reply, reply);
    return reply;
  }

  compare(other: Message | null): number | null {
    if (other == null) {
      return 1;
    } else {
      const [a, b] = [this.date(), other.date()];
      return cmp(a, b);
    }
  }

  equals(other: Message | null | undefined): boolean {
    if (typeof other?.encoded !== "function") return false;

    if (present(this.messageId()) && present(other.messageId())) {
      return this.encoded() === other.encoded();
    } else {
      const m = rbObjDup(this);
      m.setMessageId("<temp@test>");
      const o = rbObjDup(other);
      o.setMessageId("<temp@test>");
      return m.encoded() === o.encoded();
    }
  }

  initializeCopy(_original: Message): this {
    this._header = rbObjDup(this._header!);
    return this;
  }

  get rawSource(): string {
    return this._rawSource;
  }

  setEnvelope(val: unknown): void {
    this._rawEnvelope = val;
    try {
      this._envelope = Envelope.parse(val);
    } catch {
      this._envelope = null;
    }
  }

  get rawEnvelope(): unknown {
    return this._rawEnvelope;
  }

  envelopeFrom(): unknown {
    return this._envelope != null ? this._envelope.from() : null;
  }

  envelopeDate(): unknown {
    return this._envelope != null ? this._envelope.date() : null;
  }

  setHeader(value: unknown): void {
    this._header = new Header(value as string | null, this.charset);
  }

  header(value: unknown = null): Header {
    if (present(value)) this.setHeader(value);
    return this._header!;
  }

  headers(hash: Record<string, unknown> | Hash<string, unknown> = {}): void {
    eachPair(hash, (k, v) => this.header().set(k, v));
  }

  errors(): unknown[] {
    return this.header().errors();
  }

  bcc(val: unknown = null): unknown {
    return this.default("bcc", val);
  }

  setBcc(val: unknown): void {
    this.header().set("bcc", val);
  }

  cc(val: unknown = null): unknown {
    return this.default("cc", val);
  }

  setCc(val: unknown): void {
    this.header().set("cc", val);
  }

  comments(val: unknown = null): unknown {
    return this.default("comments", val);
  }

  setComments(val: unknown): void {
    this.header().set("comments", val);
  }

  contentDescription(val: unknown = null): unknown {
    return this.default("content_description", val);
  }

  setContentDescription(val: unknown): void {
    this.header().set("content_description", val);
  }

  contentDisposition(val: unknown = null): unknown {
    return this.default("content_disposition", val);
  }

  setContentDisposition(val: unknown): void {
    this.header().set("content_disposition", val);
  }

  contentId(val: unknown = null): unknown {
    return this.default("content_id", val);
  }

  setContentId(val: unknown): void {
    this.header().set("content_id", val);
  }

  contentLocation(val: unknown = null): unknown {
    return this.default("content_location", val);
  }

  setContentLocation(val: unknown): void {
    this.header().set("content_location", val);
  }

  contentTransferEncoding(val: unknown = null): unknown {
    return this.default("content_transfer_encoding", val);
  }

  setContentTransferEncoding(val: unknown): void {
    this.header().set("content_transfer_encoding", val);
  }

  contentType(val: unknown = null): unknown {
    return this.default("content_type", val);
  }

  setContentType(val: unknown): void {
    this.header().set("content_type", val);
  }

  date(val: unknown = null): unknown {
    return this.default("date", val);
  }

  setDate(val: unknown): void {
    this.header().set("date", val);
  }

  from(val: unknown = null): unknown {
    return this.default("from", val);
  }

  setFrom(val: unknown): void {
    this.header().set("from", val);
  }

  inReplyTo(val: unknown = null): unknown {
    return this.default("in_reply_to", val);
  }

  setInReplyTo(val: unknown): void {
    this.header().set("in_reply_to", val);
  }

  keywords(val: unknown = null): unknown {
    return this.default("keywords", val);
  }

  setKeywords(val: unknown): void {
    this.header().set("keywords", val);
  }

  messageId(val: unknown = null): unknown {
    return this.default("message_id", val);
  }

  setMessageId(val: unknown): void {
    this.header().set("message_id", val);
  }

  mimeVersion(val: unknown = null): unknown {
    return this.default("mime_version", val);
  }

  setMimeVersion(val: unknown): void {
    this.header().set("mime_version", val);
  }

  references(val: unknown = null): unknown {
    return this.default("references", val);
  }

  setReferences(val: unknown): void {
    this.header().set("references", val);
  }

  replyTo(val: unknown = null): unknown {
    return this.default("reply_to", val);
  }

  setReplyTo(val: unknown): void {
    this.header().set("reply_to", val);
  }

  resentBcc(val: unknown = null): unknown {
    return this.default("resent_bcc", val);
  }

  setResentBcc(val: unknown): void {
    this.header().set("resent_bcc", val);
  }

  resentCc(val: unknown = null): unknown {
    return this.default("resent_cc", val);
  }

  setResentCc(val: unknown): void {
    this.header().set("resent_cc", val);
  }

  resentDate(val: unknown = null): unknown {
    return this.default("resent_date", val);
  }

  setResentDate(val: unknown): void {
    this.header().set("resent_date", val);
  }

  resentFrom(val: unknown = null): unknown {
    return this.default("resent_from", val);
  }

  setResentFrom(val: unknown): void {
    this.header().set("resent_from", val);
  }

  resentMessageId(val: unknown = null): unknown {
    return this.default("resent_message_id", val);
  }

  setResentMessageId(val: unknown): void {
    this.header().set("resent_message_id", val);
  }

  resentSender(val: unknown = null): unknown {
    return this.default("resent_sender", val);
  }

  setResentSender(val: unknown): void {
    this.header().set("resent_sender", val);
  }

  resentTo(val: unknown = null): unknown {
    return this.default("resent_to", val);
  }

  setResentTo(val: unknown): void {
    this.header().set("resent_to", val);
  }

  returnPath(val: unknown = null): unknown {
    return this.default("return_path", val);
  }

  setReturnPath(val: unknown): void {
    this.header().set("return_path", val);
  }

  sender(val: unknown = null): unknown {
    return this.default("sender", val);
  }

  setSender(val: unknown): void {
    this.header().set("sender", val);
  }

  subject(val: unknown = null): unknown {
    return this.default("subject", val);
  }

  setSubject(val: unknown): void {
    this.header().set("subject", val);
  }

  to(val: unknown = null): unknown {
    return this.default("to", val);
  }

  setTo(val: unknown): void {
    this.header().set("to", val);
  }

  transportEncoding(val: unknown = null): unknown {
    if (present(val)) {
      return this.setTransportEncoding(val);
    } else {
      return this._transportEncoding;
    }
  }

  setTransportEncoding(val: unknown): void {
    this._transportEncoding = Encodings.getEncoding(val as string);
  }

  received(val: unknown = null): unknown {
    if (present(val)) {
      return this.header().set("received", val);
    } else {
      return this.header().get("received");
    }
  }

  setReceived(val: unknown): void {
    this.header().set("received", val);
  }

  smtpEnvelopeFrom(val: unknown = null): unknown {
    if (present(val)) {
      return this.setSmtpEnvelopeFrom(val);
    } else {
      return (
        this._smtpEnvelopeFrom ||
        this.returnPath() ||
        this.sender() ||
        (this.fromAddrs()[0] ?? null)
      );
    }
  }

  setSmtpEnvelopeFrom(val: unknown): void {
    this._smtpEnvelopeFrom = val;
  }

  smtpEnvelopeTo(val: unknown = null): unknown {
    if (present(val)) {
      return this.setSmtpEnvelopeTo(val);
    } else {
      return this._smtpEnvelopeTo || this.destinations();
    }
  }

  setSmtpEnvelopeTo(val: unknown): void {
    this._smtpEnvelopeTo = Array.isArray(val) || val == null ? val : [val];
  }

  default(sym: string, val: unknown = null): unknown {
    if (present(val)) {
      return this.header().set(sym, val);
    }
    const field = this.header().get(sym);
    if (field != null) {
      return (field as unknown as { default(): unknown }).default();
    }
    return null;
  }

  setBody(value: unknown): void {
    this.bodyLazy(value as string | null);
  }

  body(value: unknown = null): Body {
    if (present(value)) {
      this.setBody(value);
    } else if (this._bodyRaw != null) {
      this.processBodyRaw();
    }
    return this._body!;
  }

  bodyEncoding(value: unknown = null): unknown {
    if (value == null) {
      return this.body().encoding();
    } else {
      return this.body().setEncoding(value);
    }
  }

  setBodyEncoding(value: unknown): void {
    this.body().setEncoding(value);
  }

  destinations(): unknown[] {
    return flatten([this.toAddrs(), this.ccAddrs(), this.bccAddrs()].filter((x) => x != null));
  }

  fromAddrs(): unknown[] {
    return present(this.from()) ? flatten([this.from()]) : [];
  }

  toAddrs(): unknown[] {
    return present(this.to()) ? flatten([this.to()]) : [];
  }

  ccAddrs(): unknown[] {
    return present(this.cc()) ? flatten([this.cc()]) : [];
  }

  bccAddrs(): unknown[] {
    return present(this.bcc()) ? flatten([this.bcc()]) : [];
  }

  set(name: unknown, value: unknown): void {
    if (typeof name === "string" && /^[a-z][A-Za-z\d]*$/.test(name)) {
      name = name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    }
    if (rbObjAsString(name) === "body") {
      this.setBody(value);
    } else if (/content[-_]type/i.test(rbObjAsString(name))) {
      this.header().set(name, value);
    } else if (rbObjAsString(name) === "charset") {
      this.charset = value as string | null;
    } else {
      this.header().set(name, value);
    }
  }

  get(name: unknown): Field | Field[] | null {
    return this.header().get(Utilities.underscoreize(name));
  }

  methodMissing(name: string, ...args: unknown[]): unknown {
    const fieldName = Utilities.underscoreize(name).replace(/=$/, "");
    if ((Field.KNOWN_FIELDS as readonly string[]).includes(fieldName)) {
      if (args.length === 0) {
        return this.header().get(fieldName);
      } else {
        return this.header().set(fieldName, args[0]);
      }
    } else {
      throw new NoMethodError(`undefined method '${name}' for an instance of Mail::Message`);
    }
  }

  headerFields(): unknown {
    return this.header().fields;
  }

  hasMessageId(): boolean {
    return this.header().hasMessageId();
  }

  hasDate(): boolean {
    return this.header().hasDate();
  }

  hasMimeVersion(): boolean {
    return this.header().hasMimeVersion();
  }

  hasContentType(): boolean {
    try {
      return present((this.header().get("content_type") as unknown as ContentTypeField).mainType());
    } catch {
      return false;
    }
  }

  hasCharset(): boolean {
    let tmp: ParameterHash | null;
    try {
      tmp = (this.header().get("content_type") as unknown as ContentTypeField).parameters();
    } catch {
      tmp = null;
    }
    return this.hasContentType() && tmp != null && present(tmp.get("charset"));
  }

  hasContentTransferEncoding(): boolean {
    const field = this.header().get("content_transfer_encoding");
    return present(field) && Utilities.isBlank((field as Field).errors);
  }

  addMessageId(msgIdVal: unknown = ""): void {
    this.header().set("message-id", msgIdVal);
  }

  addDate(dateVal: unknown = ""): void {
    this.header().set("date", dateVal);
  }

  addMimeVersion(verVal: unknown = ""): void {
    this.header().set("mime-version", verVal);
  }

  addContentType(): void {
    this.header().set("content_type", "text/plain");
  }

  addCharset(): void {
    if (!this.body().isEmpty()) {
      if (this._defaultedCharset && !this.body().isAsciiOnly() && !this.isAttachment()) {
        const warning =
          "Non US-ASCII detected and no charset defined.\nDefaulting to UTF-8, set your own if this is incorrect.\n";
        warn(warning);
      }
      if (this._charset != null) {
        (this.header().get("content_type") as unknown as ContentTypeField)
          .parameters()
          .set("charset", this._charset);
      }
    }
  }

  addContentTransferEncoding(): void {
    if (this.header().get("content_transfer_encoding") == null) {
      this.header().set("content_transfer_encoding", this.body().defaultEncoding());
    }
  }

  mimeType(): string | null {
    try {
      return this.hasContentType()
        ? (this.header().get("content_type") as unknown as ContentTypeField).string()
        : null;
    } catch {
      return null;
    }
  }

  get charset(): string | null {
    if (this._header != null) {
      return this.hasContentType() && !this.isMultipart()
        ? (this.contentTypeParameters()!.get("charset") as string | null)
        : this._charset;
    } else {
      return this._charset;
    }
  }

  set charset(value: string | null) {
    this._defaultedCharset = false;
    this._charset = value;
    this._header!.charset = value;
  }

  mainType(): string | null {
    try {
      return this.hasContentType()
        ? (this.header().get("content_type") as unknown as ContentTypeField).mainType()
        : null;
    } catch {
      return null;
    }
  }

  subType(): string | null {
    try {
      return this.hasContentType()
        ? (this.header().get("content_type") as unknown as ContentTypeField).subType()
        : null;
    } catch {
      return null;
    }
  }

  contentTypeParameters(): ParameterHash | null {
    try {
      return this.hasContentType()
        ? (this.header().get("content_type") as unknown as ContentTypeField).parameters()
        : null;
    } catch {
      return null;
    }
  }

  isMultipart(): boolean {
    return this.hasContentType() ? /^multipart$/im.test(this.mainType() ?? "") : false;
  }

  isMultipartReport(): boolean {
    return this.isMultipart() && /^report$/im.test(this.subType() ?? "");
  }

  isDeliveryStatusReport(): boolean {
    return (
      this.isMultipartReport() &&
      /^delivery-status$/im.test((this.contentTypeParameters()!.get("report-type") as string) ?? "")
    );
  }

  deliveryStatusPart(): Part | null {
    if (this._deliveryStatusPart === undefined) {
      this._deliveryStatusPart = this.isDeliveryStatusReport()
        ? (this.parts.find((p) => p.isDeliveryStatusReportPart()) ?? null)
        : null;
    }
    return this._deliveryStatusPart;
  }

  isBounced(): unknown {
    return this.deliveryStatusPart() && this.deliveryStatusPart()!.isBounced();
  }

  action(): unknown {
    return this.deliveryStatusPart() && this.deliveryStatusPart()!.action();
  }

  finalRecipient(): unknown {
    return this.deliveryStatusPart() && this.deliveryStatusPart()!.finalRecipient();
  }

  errorStatus(): unknown {
    return this.deliveryStatusPart() && this.deliveryStatusPart()!.errorStatus();
  }

  diagnosticCode(): unknown {
    return this.deliveryStatusPart() && this.deliveryStatusPart()!.diagnosticCode();
  }

  remoteMta(): unknown {
    return this.deliveryStatusPart() && this.deliveryStatusPart()!.remoteMta();
  }

  isRetryable(): unknown {
    return this.deliveryStatusPart() && this.deliveryStatusPart()!.isRetryable();
  }

  boundary(): string | null {
    const params = this.contentTypeParameters();
    return params != null ? (params.get("boundary") as string | null) : null;
  }

  get parts(): PartsList {
    return this.body().parts;
  }

  attachments(): AttachmentsList {
    return this.parts.attachments();
  }

  hasAttachments(): boolean {
    return this.attachments().length !== 0;
  }

  htmlPart(block?: MessageBlock): Message | null | void {
    if (block !== undefined) {
      return this.setHtmlPart(new Mail.Part({ contentType: "text/html" }, block));
    } else {
      return this._htmlPart ?? this.findFirstMimeType("text/html");
    }
  }

  textPart(block?: MessageBlock): Message | null | void {
    if (block !== undefined) {
      return this.setTextPart(new Mail.Part({ contentType: "text/plain" }, block));
    } else {
      return this._textPart ?? this.findFirstMimeType("text/plain");
    }
  }

  setHtmlPart(msg: unknown): void {
    if (present(msg)) {
      if (!(msg instanceof Message)) msg = new Mail.Part({ body: msg });
      this._htmlPart = msg as Message;
      if (!this._htmlPart.hasContentType()) this._htmlPart.setContentType("text/html");
      if (present(this.textPart())) this.addMultipartAlternateHeader();
      this.addPart(this._htmlPart as Part);
    } else if (this._htmlPart != null) {
      const index = this.parts.indexOf(this._htmlPart as Part);
      if (index !== -1) this.parts.splice(index, 1);
      this._htmlPart = null;
      if (present(this.textPart())) {
        this.setContentType(null);
        this.body().boundary = null;
      }
    }
  }

  setTextPart(msg: unknown): void {
    if (present(msg)) {
      if (!(msg instanceof Message)) msg = new Mail.Part({ body: msg });
      this._textPart = msg as Message;
      if (!this._textPart.hasContentType()) this._textPart.setContentType("text/plain");
      if (present(this.htmlPart())) this.addMultipartAlternateHeader();
      this.addPart(this._textPart as Part);
    } else if (this._textPart != null) {
      const index = this.parts.indexOf(this._textPart as Part);
      if (index !== -1) this.parts.splice(index, 1);
      this._textPart = null;
      if (present(this.htmlPart())) {
        this.setContentType(null);
        this.body().boundary = null;
      }
    }
  }

  addPart(part: Part): unknown {
    if (!this.body().isMultipart() && !Utilities.isBlank(this.body().decoded())) {
      this._textPart = new Mail.Part("Content-Type: text/plain;");
      this._textPart.setBody(this.body().decoded());
      this.body().push(this._textPart as Part);
      this.addMultipartAlternateHeader();
    }
    this.addBoundary();
    return this.body().push(part);
  }

  part(params: Record<string, unknown> = {}, block?: (part: Part) => unknown): unknown {
    const newPart = new Mail.Part(params);
    if (block !== undefined) block(newPart);
    return this.addPart(newPart);
  }

  async addFile(values: string | { filename: string }): Promise<unknown> {
    if (!(this.isMultipart() || Utilities.isBlank(this.body().decoded()))) {
      this.convertToMultipart();
    }
    this.addMultipartMixedHeader();
    let basename: string;
    let filedata: unknown;
    if (typeof values === "string") {
      basename = File.basename(values);
      filedata = await IO.binread(values);
    } else {
      basename = values.filename;
      filedata = values;
    }
    return this.attachments().set(basename, filedata);
  }

  convertToMultipart(): void {
    const textPart = new Mail.Part({ body: this.body().decoded() });
    for (const [reader, writer] of MULTIPART_CONVERSION_CONTENT_FIELDS) {
      const value = this[reader]();
      if (present(value)) {
        textPart[writer](value);
        this[writer](null);
      }
    }
    if (!this._defaultedCharset) textPart.charset = this.charset;
    this.setBody("");
    this.body().push(textPart);
  }

  readyToSendBang(): void {
    this.identifyAndSetTransferEncoding();
    for (const part of this.parts) {
      part.setTransportEncoding(this.transportEncoding());
      part.readyToSendBang();
    }
    this.addRequiredFields();
  }

  encoded(): string {
    this.readyToSendBang();
    let buffer = this.header().encoded();
    buffer += "\r\n";
    const body = this.body().encoded(this.contentTransferEncoding() as string | null);
    buffer += typeof body === "string" ? body : new TextDecoder("latin1").decode(body);
    return buffer;
  }

  withoutAttachmentsBang(): this {
    if (this.hasAttachments()) {
      this.parts.deleteAttachments();
      const reencoded =
        this.parts.length === 0
          ? ""
          : this.body().encoded(this.contentTransferEncoding() as string | null);
      this._body = null;
      this.setBody(reencoded);
    }
    return this;
  }

  toYaml(opts: Record<string, unknown> = {}): string {
    const hash: Record<string, unknown> = {};
    hash["headers"] = {};
    this.header().fields.forEach((field) => {
      (hash["headers"] as Record<string, unknown>)[field.name] = field.value;
    });
    if (this.deliveryHandler != null && this.deliveryHandler !== false) {
      hash["delivery_handler"] = rbObjAsString(this.deliveryHandler);
    }
    hash["transport_encoding"] = rbObjAsString(this.transportEncoding());
    const specialVariables = ["@header", "@delivery_handler", "@transport_encoding"];
    if (this.isMultipart()) {
      hash["multipart_body"] = [];
      this.body().parts.map((part) => (hash["multipart_body"] as string[]).push(part.toYaml()));
      specialVariables.push("@body", "@text_part", "@html_part");
    }
    for (const v of rbObjInstanceVariables(this).filter((v) => !specialVariables.includes(v))) {
      hash[v] = rbObjIvarGet(this, v);
    }
    return toYaml(hash, opts);
  }

  static fromYaml(str: string): Message {
    const hash = MailYAML.load(str) as Hash<string, unknown>;
    const m = new this({ headers: hashAref(hash, "headers") });
    hashDelete(hash, "headers");
    eachPair(hash, (k, v) => {
      if (k === "delivery_handler") {
        try {
          if (!Utilities.isBlank(v)) m.deliveryHandler = constGet(TopLevel, v as string);
        } catch (e) {
          if (!(e instanceof NameError)) throw e;
        }
      } else if (k === "transport_encoding") {
        m.transportEncoding(v);
      } else if (k === "multipart_body") {
        (v as string[]).map((part) => m.addPart(Mail.Part.fromYaml(part) as Part));
      } else if (/^@/.test(k)) {
        rbObjIvarSet(m, k, v);
      }
    });
    return m;
  }

  static fromHash(hash: Record<string, unknown>): Message {
    return new Message(hash);
  }

  toString(): string {
    return this.encoded();
  }

  inspect(): string {
    return `#<${this.constructor.name}:${rbObjId(this)}, Multipart: ${this.isMultipart()}, Headers: ${this.header().fieldSummary()}>`;
  }

  inspectStructure(): string {
    return this.inspect() + (this.isMultipart() ? `\n${this.parts.inspectStructure()}` : "");
  }

  decoded(): unknown {
    if (this.isText()) {
      return this.decodeBodyAsText();
    } else if (this.isAttachment()) {
      return this.decodeBody();
    } else if (!this.isMultipart()) {
      return this.body().decoded();
    } else {
      throw new NoMethodError(
        "Can not decode an entire message, try calling #decoded on the various fields and body or parts if it is a multipart message.",
      );
    }
  }

  read(): unknown {
    if (this.isAttachment()) {
      return this.decodeBody();
    } else {
      throw new NoMethodError("Can not call read on a part unless it is an attachment.");
    }
  }

  decodeBody(): unknown {
    return this.body().decoded();
  }

  isAttachment(): boolean {
    return present(this.findAttachment());
  }

  attachment(): unknown {
    return this._attachment;
  }

  filename(): unknown {
    return this.findAttachment();
  }

  allParts(): Part[] {
    return flatten(this.parts.map((p) => [p, p.allParts()])) as Part[];
  }

  findFirstMimeType(mt: string): Part | null {
    return this.allParts().find((p) => p.mimeType() === mt && !p.isAttachment()) ?? null;
  }

  skipDeletion(): void {
    this._markForDelete = false;
  }

  setMarkForDelete(value = true): void {
    this._markForDelete = value;
  }

  isMarkedForDelete(): boolean {
    return this._markForDelete;
  }

  isText(): boolean {
    return this.hasContentType() ? /^text$/im.test(this.mainType() ?? "") : false;
  }

  /** @internal */
  protected parseMessage(): void {
    const [headerPart, bodyPart] = stringSplit(
      this.rawSource.replace(/^[\s\0]+/, ""),
      new RegExp(`${Constants.LAX_CRLF.source}${Constants.LAX_CRLF.source}`),
      2,
    );
    this.setHeader(headerPart ?? null);
    this.setBody(bodyPart ?? null);
  }

  /** @internal */
  private bodyLazy(value: string | null): void {
    if (this._bodyRaw != null && value != null) this.processBodyRaw();
    if (value == null || value.length <= 0) {
      this._body = new Body("");
      this._bodyRaw = null;
      this.addEncodingToBody();
    } else if (this._body != null && this._body.isMultipart()) {
      this.setTextPart(value);
    } else {
      this._bodyRaw = value;
    }
  }

  /** @internal */
  private processBodyRaw(): void {
    this._body = new Body(this._bodyRaw);
    this._bodyRaw = null;
    if (this._separateParts) this.separateParts();
    this.addEncodingToBody();
  }

  /** @internal */
  private setEnvelopeHeader(): void {
    const rawString = rbObjAsString(this.rawSource);
    const matchData = new RegExp(
      `^From\\s+([^:\\s]${Constants.TEXT.source}*)${Constants.LAX_CRLF.source}`,
    ).exec(rawString);
    if (matchData) {
      this.setEnvelope(matchData[1]);
      this._rawSource = rawString.replace(matchData[0], "");
    }
  }

  /** @internal */
  private separateParts(): void {
    this.body().splitBang(this.boundary());
  }

  /** @internal */
  private allowedEncodings(): (typeof TransferEncoding)[] | null {
    if (this.mimeType() === "message/rfc822") {
      return [
        Encodings.getEncoding("7bit")!,
        Encodings.getEncoding("8bit")!,
        Encodings.getEncoding("binary")!,
      ];
    }
    return null;
  }

  /** @internal */
  private addEncodingToBody(): void {
    if (this.hasContentTransferEncoding()) this._body!.setEncoding(this.contentTransferEncoding());
  }

  /** @internal */
  private identifyAndSetTransferEncoding(): void {
    if (present(this.body())) {
      if (this.body().isMultipart()) {
        this.setContentTransferEncoding(this._transportEncoding);
      } else {
        this.setContentTransferEncoding(
          String(
            this.body().negotiateBestEncoding(
              this._transportEncoding as typeof TransferEncoding | null,
              this.allowedEncodings(),
            ),
          ),
        );
      }
    }
  }

  /** @internal */
  protected addRequiredFields(): void {
    this.addRequiredMessageFields();
    if (this.body().isMultipart()) this.addMultipartMixedHeader();
    if (!this.hasContentType()) this.addContentType();
    if (this.isText() && !this.hasCharset()) this.addCharset();
    if (!this.hasContentTransferEncoding()) this.addContentTransferEncoding();
  }

  /** @internal */
  protected addRequiredMessageFields(): void {
    if (!this.hasDate()) this.addDate();
    if (!this.hasMimeVersion()) this.addMimeVersion();
    if (!this.hasMessageId()) this.addMessageId();
  }

  /** @internal */
  private addMultipartAlternateHeader(): void {
    this.header().set("content-type", ContentTypeField.withBoundary("multipart/alternative").value);
    this.body().boundary = this.boundary();
  }

  /** @internal */
  private addBoundary(): void {
    if (!(present(this.body().boundary) && present(this.boundary()))) {
      if (!present(this.header().get("content-type") as unknown as ContentTypeField)) {
        const charset = this.charset;
        this.header().set("content-type", "multipart/mixed");
        (this.header().get("content-type") as unknown as ContentTypeField)
          .parameters()
          .set("charset", charset);
      }
      (this.header().get("content-type") as unknown as ContentTypeField)
        .parameters()
        .set("boundary", ContentTypeField.generateBoundary());
      this.body().boundary = this.boundary();
    }
  }

  /** @internal */
  private addMultipartMixedHeader(): void {
    if (!present(this.header().get("content-type") as unknown as ContentTypeField)) {
      this.header().set("content-type", ContentTypeField.withBoundary("multipart/mixed").value);
      this.body().boundary = this.boundary();
    }
  }

  /** @internal */
  private initWithHash(hash: Record<string, unknown>): void {
    const passedInOptions = new IndifferentHash(hash);
    this._rawSource = "";

    this._header = new Header();
    this._body = new Body();
    this._bodyRaw = null;

    let bodyContent: unknown = null;

    for (const [key, v] of passedInOptions.entries()) {
      const k = Utilities.underscoreize(key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`));
      if (k === "headers") {
        this.headers(v as Record<string, unknown>);
      } else if (k === "body") {
        bodyContent = v;
      } else {
        this.set(k, v);
      }
    }

    if (present(bodyContent)) {
      this.setBody(bodyContent);
      if (this.hasContentTransferEncoding()) {
        this.body().setEncoding(this.contentTransferEncoding());
      }
    }
  }

  /** @internal */
  protected initWithString(string: string): void {
    this._rawSource = string;
    this.setEnvelopeHeader();
    this.parseMessage();
    this._separateParts = this.isMultipart();
  }

  /** @internal */
  private findAttachment(): unknown {
    const rescue = (f: () => unknown): unknown => {
      try {
        return f();
      } catch {
        return null;
      }
    };
    const contentTypeName = rescue(() =>
      (this.header().get("content_type") as unknown as ContentTypeField).filename(),
    );
    const contentDispName = rescue(() =>
      (this.header().get("content_disposition") as unknown as ContentDispositionField).filename(),
    );
    const contentLocName = rescue(() =>
      (this.header().get("content_location") as unknown as ContentLocationField).location(),
    );
    let filename: unknown;
    if (present(this.contentDisposition()) && present(contentDispName)) {
      filename = contentDispName;
    } else if (present(this.contentType()) && present(contentTypeName)) {
      filename = contentTypeName;
    } else if (present(this.contentLocation()) && present(contentLocName)) {
      filename = contentLocName;
    } else {
      filename = null;
    }
    if (present(filename)) {
      try {
        filename = Encodings.decodeEncode(filename as string, "decode");
      } catch {
        return filename;
      }
    }
    return filename;
  }

  /** @internal */
  private async doDelivery(): Promise<void> {
    try {
      if (this.performDeliveries) {
        await (
          this._deliveryMethod as { deliverBang(mail: Message): Promise<unknown> }
        ).deliverBang(this);
      }
    } catch (e) {
      if (!(e instanceof StandardError) && e instanceof Exception) throw e;
      if (this.raiseDeliveryErrors) throw e;
    }
  }

  /** @internal */
  private decodeBodyAsText(): unknown {
    return Encodings.transcodeCharset(this.decodeBody() as string, this.charset, "UTF-8");
  }
}
Mail.Message = Message;
rbDeclareIvar(Message, "@body", "_body");
rbDeclareIvar(Message, "@body_raw", "_bodyRaw");
rbDeclareIvar(Message, "@separate_parts", "_separateParts");
rbDeclareIvar(Message, "@text_part", "_textPart");
rbDeclareIvar(Message, "@html_part", "_htmlPart");
rbDeclareIvar(Message, "@errors", "_errors");
rbDeclareIvar(Message, "@header", "_header");
rbDeclareIvar(Message, "@charset", "_charset");
rbDeclareIvar(Message, "@defaulted_charset", "_defaultedCharset");
rbDeclareIvar(Message, "@smtp_envelope_from", "_smtpEnvelopeFrom");
rbDeclareIvar(Message, "@smtp_envelope_to", "_smtpEnvelopeTo");
rbDeclareIvar(Message, "@perform_deliveries", "performDeliveries");
rbDeclareIvar(Message, "@raise_delivery_errors", "raiseDeliveryErrors");
rbDeclareIvar(Message, "@delivery_method", "_deliveryMethod");
rbDeclareIvar(Message, "@transport_encoding", "_transportEncoding");
rbDeclareIvar(Message, "@mark_for_delete", "_markForDelete");
rbDeclareIvar(Message, "@raw_source", "_rawSource");
rbDeclareIvar(Message, "@raw_envelope", "_rawEnvelope");
rbDeclareIvar(Message, "@envelope", "_envelope");
rbDeclareIvar(Message, "@delivery_status_part", "_deliveryStatusPart");
rbDeclareIvar(Message, "@attachment", "_attachment");
