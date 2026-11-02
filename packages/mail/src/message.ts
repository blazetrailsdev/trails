import {
  flatten,
  isAsciiOnly,
  NoMethodError,
  rbObjAsString,
  rbObjId,
  strip,
  stringSplit,
  warn,
  File,
  IO,
} from "@blazetrails/ruby-compat";
import { Body } from "./body.js";
import * as Constants from "./constants.js";
import type { AttachmentsList } from "./attachments-list.js";
import { Encodings } from "./encodings.js";
import { ContentTypeField } from "./fields/content-type-field.js";
import { Envelope } from "./envelope.js";
import { Field } from "./field.js";
import { Header } from "./header.js";
import { IndifferentHash } from "./indifferent-hash.js";
import { Mail } from "./mail.js";
import type { PartsList } from "./parts-list.js";
import { Utilities } from "./utilities.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type MessageBlock = ((message: any) => unknown) | undefined;

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
  protected _textPart: any = null;
  protected _htmlPart: any = null;
  protected _header: Header | null = null;
  protected _charset: string | null;
  protected _defaultedCharset = true;
  protected _smtpEnvelopeFrom: unknown = null;
  protected _smtpEnvelopeTo: unknown = null;
  protected _transportEncoding: unknown;
  protected _markForDelete = false;
  protected _rawSource = "";
  protected _rawEnvelope: unknown = null;
  protected _envelope: Envelope | null = null;
  protected _deliveryStatusPart: any;
  protected _attachment: unknown = undefined;

  deliveryHandler: any = null;
  performDeliveries = true;
  raiseDeliveryErrors = true;

  static get defaultCharset(): string {
    return defaultCharset;
  }

  static set defaultCharset(charset: string) {
    defaultCharset = charset;
  }

  constructor(...args: unknown[]) {
    const block = (typeof args.at(-1) === "function" ? args.pop() : undefined) as MessageBlock;
    this._charset = (this.constructor as typeof Message).defaultCharset;
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
        block(this);
      }
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
      reply.setSubject(/^Re:/im.test(subject) ? subject : `Re: ${subject}`);
    }
    if (present(this.replyTo()) || present(this.from())) {
      reply.setTo(rbObjAsString(this.get(present(this.replyTo()) ? "reply_to" : "from")));
    }
    if (present(this.to())) {
      reply.setFrom(rbObjAsString(this.get("to").formatted()[0]));
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
      return a < b ? -1 : a > b ? 1 : 0;
    }
  }

  equals(other: any): boolean {
    if (typeof other?.encoded !== "function") return false;
    if (present(this.messageId()) && present(other.messageId())) {
      return this.encoded() === other.encoded();
    } else {
      const m = new (this.constructor as typeof Message)(this.encoded());
      m.setMessageId("<temp@test>");
      const o = new other.constructor(other.encoded());
      o.setMessageId("<temp@test>");
      return m.encoded() === o.encoded();
    }
  }

  initializeCopy(_original: Message): this {
    this._header = this._header!.constructor === Header ? new Header(this._header.encoded()) : null;
    return this;
  }

  get rawSource(): string {
    return this._rawSource;
  }

  setEnvelope(val: unknown): void {
    this._rawEnvelope = val;
    try {
      this._envelope = (Envelope as any).parse(val);
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

  header(value: unknown = null): any {
    return present(value) ? this.setHeader(value) : this._header;
  }

  headers(hash: Record<string, unknown> = {}): void {
    for (const [k, v] of Object.entries(hash)) this.header().set(k, v);
  }

  errors(): unknown[] {
    return this.header().errors();
  }

  bcc(val: unknown = null): any {
    return this.default("bcc", val);
  }

  setBcc(val: unknown): void {
    this.header().set("bcc", val);
  }

  cc(val: unknown = null): any {
    return this.default("cc", val);
  }

  setCc(val: unknown): void {
    this.header().set("cc", val);
  }

  comments(val: unknown = null): any {
    return this.default("comments", val);
  }

  setComments(val: unknown): void {
    this.header().set("comments", val);
  }

  contentDescription(val: unknown = null): any {
    return this.default("content_description", val);
  }

  setContentDescription(val: unknown): void {
    this.header().set("content_description", val);
  }

  contentDisposition(val: unknown = null): any {
    return this.default("content_disposition", val);
  }

  setContentDisposition(val: unknown): void {
    this.header().set("content_disposition", val);
  }

  contentId(val: unknown = null): any {
    return this.default("content_id", val);
  }

  setContentId(val: unknown): void {
    this.header().set("content_id", val);
  }

  contentLocation(val: unknown = null): any {
    return this.default("content_location", val);
  }

  setContentLocation(val: unknown): void {
    this.header().set("content_location", val);
  }

  contentTransferEncoding(val: unknown = null): any {
    return this.default("content_transfer_encoding", val);
  }

  setContentTransferEncoding(val: unknown): void {
    this.header().set("content_transfer_encoding", val);
  }

  contentType(val: unknown = null): any {
    return this.default("content_type", val);
  }

  setContentType(val: unknown): void {
    this.header().set("content_type", val);
  }

  date(val: unknown = null): any {
    return this.default("date", val);
  }

  setDate(val: unknown): void {
    this.header().set("date", val);
  }

  from(val: unknown = null): any {
    return this.default("from", val);
  }

  setFrom(val: unknown): void {
    this.header().set("from", val);
  }

  inReplyTo(val: unknown = null): any {
    return this.default("in_reply_to", val);
  }

  setInReplyTo(val: unknown): void {
    this.header().set("in_reply_to", val);
  }

  keywords(val: unknown = null): any {
    return this.default("keywords", val);
  }

  setKeywords(val: unknown): void {
    this.header().set("keywords", val);
  }

  messageId(val: unknown = null): any {
    return this.default("message_id", val);
  }

  setMessageId(val: unknown): void {
    this.header().set("message_id", val);
  }

  mimeVersion(val: unknown = null): any {
    return this.default("mime_version", val);
  }

  setMimeVersion(val: unknown): void {
    this.header().set("mime_version", val);
  }

  references(val: unknown = null): any {
    return this.default("references", val);
  }

  setReferences(val: unknown): void {
    this.header().set("references", val);
  }

  replyTo(val: unknown = null): any {
    return this.default("reply_to", val);
  }

  setReplyTo(val: unknown): void {
    this.header().set("reply_to", val);
  }

  resentBcc(val: unknown = null): any {
    return this.default("resent_bcc", val);
  }

  setResentBcc(val: unknown): void {
    this.header().set("resent_bcc", val);
  }

  resentCc(val: unknown = null): any {
    return this.default("resent_cc", val);
  }

  setResentCc(val: unknown): void {
    this.header().set("resent_cc", val);
  }

  resentDate(val: unknown = null): any {
    return this.default("resent_date", val);
  }

  setResentDate(val: unknown): void {
    this.header().set("resent_date", val);
  }

  resentFrom(val: unknown = null): any {
    return this.default("resent_from", val);
  }

  setResentFrom(val: unknown): void {
    this.header().set("resent_from", val);
  }

  resentMessageId(val: unknown = null): any {
    return this.default("resent_message_id", val);
  }

  setResentMessageId(val: unknown): void {
    this.header().set("resent_message_id", val);
  }

  resentSender(val: unknown = null): any {
    return this.default("resent_sender", val);
  }

  setResentSender(val: unknown): void {
    this.header().set("resent_sender", val);
  }

  resentTo(val: unknown = null): any {
    return this.default("resent_to", val);
  }

  setResentTo(val: unknown): void {
    this.header().set("resent_to", val);
  }

  returnPath(val: unknown = null): any {
    return this.default("return_path", val);
  }

  setReturnPath(val: unknown): void {
    this.header().set("return_path", val);
  }

  sender(val: unknown = null): any {
    return this.default("sender", val);
  }

  setSender(val: unknown): void {
    this.header().set("sender", val);
  }

  subject(val: unknown = null): any {
    return this.default("subject", val);
  }

  setSubject(val: unknown): void {
    this.header().set("subject", val);
  }

  to(val: unknown = null): any {
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
    if (field != null) return Array.isArray(field) ? field[0].default() : field.default();
    return null;
  }

  setBody(value: unknown): void {
    this.bodyLazy(value);
  }

  body(value: unknown = null): any {
    if (present(value)) {
      return this.setBody(value);
    } else {
      if (this._bodyRaw != null) this.processBodyRaw();
      return this._body;
    }
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

  get(name: unknown): any {
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
      return present(this.header().get("content_type").mainType());
    } catch {
      return false;
    }
  }

  hasCharset(): boolean {
    let tmp: any;
    try {
      tmp = this.header().get("content_type").parameters();
    } catch {
      tmp = null;
    }
    return this.hasContentType() && present(tmp) && present(tmp.get("charset"));
  }

  hasContentTransferEncoding(): boolean {
    const field = this.header().get("content_transfer_encoding");
    return present(field) && Utilities.isBlank(field.errors);
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
      if (this._defaultedCharset && !isAsciiOnly(this.body().rawSource) && !this.isAttachment()) {
        warn(
          "Non US-ASCII detected and no charset defined.\nDefaulting to UTF-8, set your own if this is incorrect.\n",
        );
      }
      if (this._charset != null) {
        this.header().get("content_type").parameters().set("charset", this._charset);
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
      return this.hasContentType() ? this.header().get("content_type").string() : null;
    } catch {
      return null;
    }
  }

  get charset(): string | null {
    if (this._header != null) {
      return this.hasContentType() && !this.isMultipart()
        ? (this.contentTypeParameters().get("charset") as string | null)
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
      return this.hasContentType() ? this.header().get("content_type").mainType() : null;
    } catch {
      return null;
    }
  }

  subType(): string | null {
    try {
      return this.hasContentType() ? this.header().get("content_type").subType() : null;
    } catch {
      return null;
    }
  }

  contentTypeParameters(): any {
    try {
      return this.hasContentType() ? this.header().get("content_type").parameters() : null;
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
      /^delivery-status$/im.test((this.contentTypeParameters().get("report-type") as string) ?? "")
    );
  }

  deliveryStatusPart(): any {
    if (this._deliveryStatusPart === undefined) {
      this._deliveryStatusPart = this.isDeliveryStatusReport()
        ? (this.parts.find((p: any) => p.isDeliveryStatusReportPart()) ?? null)
        : null;
    }
    return this._deliveryStatusPart;
  }

  isBounced(): unknown {
    return this.deliveryStatusPart() && this.deliveryStatusPart().isBounced();
  }

  action(): unknown {
    return this.deliveryStatusPart() && this.deliveryStatusPart().action();
  }

  finalRecipient(): unknown {
    return this.deliveryStatusPart() && this.deliveryStatusPart().finalRecipient();
  }

  errorStatus(): unknown {
    return this.deliveryStatusPart() && this.deliveryStatusPart().errorStatus();
  }

  diagnosticCode(): unknown {
    return this.deliveryStatusPart() && this.deliveryStatusPart().diagnosticCode();
  }

  remoteMta(): unknown {
    return this.deliveryStatusPart() && this.deliveryStatusPart().remoteMta();
  }

  isRetryable(): unknown {
    return this.deliveryStatusPart() && this.deliveryStatusPart().isRetryable();
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

  htmlPart(block?: MessageBlock): any {
    if (block !== undefined) {
      return this.setHtmlPart(new (Mail.Part as any)({ contentType: "text/html" }, block));
    } else {
      return this._htmlPart ?? this.findFirstMimeType("text/html");
    }
  }

  textPart(block?: MessageBlock): any {
    if (block !== undefined) {
      return this.setTextPart(new (Mail.Part as any)({ contentType: "text/plain" }, block));
    } else {
      return this._textPart ?? this.findFirstMimeType("text/plain");
    }
  }

  setHtmlPart(msg: any): void {
    if (present(msg)) {
      if (!(msg instanceof Message)) msg = new (Mail.Part as any)({ body: msg });
      this._htmlPart = msg;
      if (!this._htmlPart.hasContentType()) this._htmlPart.setContentType("text/html");
      if (present(this.textPart())) this.addMultipartAlternateHeader();
      this.addPart(this._htmlPart);
    } else if (this._htmlPart != null) {
      const index = this.parts.indexOf(this._htmlPart);
      if (index !== -1) this.parts.splice(index, 1);
      this._htmlPart = null;
      if (present(this.textPart())) {
        this.setContentType(null);
        this.body().boundary = null;
      }
    }
  }

  setTextPart(msg: any): void {
    if (present(msg)) {
      if (!(msg instanceof Message)) msg = new (Mail.Part as any)({ body: msg });
      this._textPart = msg;
      if (!this._textPart.hasContentType()) this._textPart.setContentType("text/plain");
      if (present(this.htmlPart())) this.addMultipartAlternateHeader();
      this.addPart(this._textPart);
    } else if (this._textPart != null) {
      const index = this.parts.indexOf(this._textPart);
      if (index !== -1) this.parts.splice(index, 1);
      this._textPart = null;
      if (present(this.htmlPart())) {
        this.setContentType(null);
        this.body().boundary = null;
      }
    }
  }

  addPart(part: unknown): unknown {
    if (!this.body().isMultipart() && !Utilities.isBlank(this.body().decoded())) {
      this._textPart = new (Mail.Part as any)("Content-Type: text/plain;");
      this._textPart.setBody(this.body().decoded());
      this.body().push(this._textPart);
      this.addMultipartAlternateHeader();
    }
    this.addBoundary();
    return this.body().push(part);
  }

  part(params: Record<string, unknown> = {}, block?: (part: any) => unknown): unknown {
    const newPart = new (Mail.Part as any)(params);
    if (block !== undefined) block(newPart);
    return this.addPart(newPart);
  }

  async addFile(values: any): Promise<unknown> {
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
    const textPart = new (Mail.Part as any)({ body: this.body().decoded() });
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
    let buffer = this.header().encoded() as string;
    buffer += "\r\n";
    const body = this.body().encoded(this.contentTransferEncoding());
    buffer += typeof body === "string" ? body : new TextDecoder("latin1").decode(body);
    return buffer;
  }

  withoutAttachmentsBang(): this {
    if (this.hasAttachments()) {
      this.parts.deleteAttachments();
      const reencoded =
        this.parts.length === 0 ? "" : this.body().encoded(this.contentTransferEncoding());
      this._body = null;
      this.setBody(reencoded);
    }
    return this;
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

  allParts(): any[] {
    return flatten(Array.from(this.parts, (p: any) => [p, p.allParts()]));
  }

  findFirstMimeType(mt: string): any {
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
  private bodyLazy(value: any): void {
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
  private allowedEncodings(): any {
    if (this.mimeType() === "message/rfc822") {
      return [
        Encodings.getEncoding("7bit"),
        Encodings.getEncoding("8bit"),
        Encodings.getEncoding("binary"),
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
          rbObjAsString(
            this.body().negotiateBestEncoding(this._transportEncoding, this.allowedEncodings()),
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
      if (!present(this.header().get("content-type"))) {
        const charset = this.charset;
        this.header().set("content-type", "multipart/mixed");
        this.header().get("content-type").parameters().set("charset", charset);
      }
      this.header()
        .get("content-type")
        .parameters()
        .set("boundary", ContentTypeField.generateBoundary());
      this.body().boundary = this.boundary();
    }
  }

  /** @internal */
  private addMultipartMixedHeader(): void {
    if (!present(this.header().get("content-type"))) {
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
    const contentTypeName = rescue(() => this.header().get("content_type").filename());
    const contentDispName = rescue(() => this.header().get("content_disposition").filename());
    const contentLocName = rescue(() => this.header().get("content_location").location());
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
        filename = Encodings.decodeEncode(filename as string, ":decode");
      } catch {
        return filename;
      }
    }
    return filename;
  }

  /** @internal */
  private decodeBodyAsText(): unknown {
    return Encodings.transcodeCharset(this.decodeBody() as string, this.charset, "UTF-8");
  }
}
Mail.Message = Message as never;
