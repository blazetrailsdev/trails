import { rbEqual, rbFArray, rbInspect, rbObjAsString } from "@blazetrails/ruby-compat";
import { Mail } from "../mail.js";
import type { Message } from "../message.js";

interface AttachmentMatcher {
  caseEquals(other: unknown): unknown;
}

export class HasSentEmailMatcher {
  declare private _sender: unknown;
  declare private _recipients: unknown[];
  declare private _copyRecipients: unknown[];
  declare private _blindCopyRecipients: unknown[];
  declare private _attachments: AttachmentMatcher[];
  declare private _havingAttachments: boolean;
  declare private _subject: unknown;
  declare private _subjectMatcher: RegExp;
  declare private _body: unknown;
  declare private _bodyMatcher: RegExp;
  declare private _htmlPartBody: unknown;
  declare private _textPartBody: unknown;

  constructor(_context: unknown) {}

  isMatches(subject: unknown): boolean {
    void subject;
    const matchingDeliveries = this.filterMatchedDeliveries(Mail.TestMailer.deliveries);
    return !(matchingDeliveries.length === 0);
  }

  from(sender: unknown): this {
    this._sender = sender;
    return this;
  }

  to(recipientOrList: unknown): this {
    this._recipients ||= [];

    if (Array.isArray(recipientOrList)) {
      this._recipients = [...this._recipients, ...recipientOrList];
    } else {
      this._recipients.push(recipientOrList);
    }
    return this;
  }

  cc(recipientOrList: unknown): this {
    this._copyRecipients ||= [];

    if (Array.isArray(recipientOrList)) {
      this._copyRecipients = [...this._copyRecipients, ...recipientOrList];
    } else {
      this._copyRecipients.push(recipientOrList);
    }
    return this;
  }

  bcc(recipientOrList: unknown): this {
    this._blindCopyRecipients ||= [];
    this._blindCopyRecipients.push(...rbFArray(recipientOrList));
    return this;
  }

  withAttachments(attachments: unknown): this {
    this._attachments ||= [];
    this._attachments.push(...(rbFArray(attachments) as AttachmentMatcher[]));
    return this;
  }

  withNoAttachments(): this {
    this._havingAttachments = false;
    return this;
  }

  withAnyAttachments(): this {
    this._havingAttachments = true;
    return this;
  }

  withSubject(subject: unknown): this {
    this._subject = subject;
    return this;
  }

  matchingSubject(subjectMatcher: RegExp): this {
    this._subjectMatcher = subjectMatcher;
    return this;
  }

  withBody(body: unknown): this {
    this._body = body;
    return this;
  }

  matchingBody(bodyMatcher: RegExp): this {
    this._bodyMatcher = bodyMatcher;
    return this;
  }

  withHtml(body: unknown): this {
    this._htmlPartBody = body;
    return this;
  }

  withText(body: unknown): this {
    this._textPartBody = body;
    return this;
  }

  description(): string {
    const result = "send a matching email";
    return result;
  }

  failureMessage(): string {
    let result = "Expected email to be sent ";
    result += this.explainExpectations();
    result += this.dumpDeliveries();
    return result;
  }

  failureMessageWhenNegated(): string {
    let result = "Expected no email to be sent ";
    result += this.explainExpectations();
    result += this.dumpDeliveries();
    return result;
  }

  /** @internal */
  protected filterMatchedDeliveries(deliveries: Message[]): Message[] {
    let candidateDeliveries = deliveries;
    const modifiers: [string, (delivery: Message) => unknown][] = [
      ["_sender", this.isMatchesOnSender],
      ["_recipients", this.isMatchesOnRecipients],
      ["_copyRecipients", this.isMatchesOnCopyRecipients],
      ["_blindCopyRecipients", this.isMatchesOnBlindCopyRecipients],
      ["_subject", this.isMatchesOnSubject],
      ["_subjectMatcher", this.isMatchesOnSubjectMatcher],
      ["_body", this.isMatchesOnBody],
      ["_bodyMatcher", this.isMatchesOnBodyMatcher],
      ["_htmlPartBody", this.isMatchesOnHtmlPartBody],
      ["_textPartBody", this.isMatchesOnTextPartBody],
      ["_havingAttachments", this.isMatchesOnHavingAttachments],
      ["_attachments", this.isMatchesOnAttachments],
    ];
    for (const [modifierName, matchesOn] of modifiers) {
      if (!Object.hasOwn(this, modifierName)) continue;
      candidateDeliveries = candidateDeliveries.filter((matchingDelivery) => {
        const result = matchesOn.call(this, matchingDelivery);
        return result != null && result !== false;
      });
    }

    return candidateDeliveries;
  }

  /** @internal */
  protected isMatchesOnSender(delivery: Message): boolean {
    return (delivery.from() as unknown[]).includes(this._sender);
  }

  /** @internal */
  protected isMatchesOnRecipients(delivery: Message): boolean {
    return this._recipients.every((recipient) => (delivery.to() as unknown[]).includes(recipient));
  }

  /** @internal */
  protected isMatchesOnCopyRecipients(delivery: Message): boolean {
    return this._copyRecipients.every((recipient) =>
      (delivery.cc() as unknown[]).includes(recipient),
    );
  }

  /** @internal */
  protected isMatchesOnBlindCopyRecipients(delivery: Message): boolean {
    return this._blindCopyRecipients.every((recipient) =>
      (delivery.bcc() as unknown[]).includes(recipient),
    );
  }

  /** @internal */
  protected isMatchesOnSubject(delivery: Message): boolean {
    return rbEqual(delivery.subject(), this._subject);
  }

  /** @internal */
  protected isMatchesOnSubjectMatcher(delivery: Message): unknown {
    return (delivery.subject() as string | null)?.match(this._subjectMatcher) ?? null;
  }

  /** @internal */
  protected isMatchesOnHavingAttachments(delivery: Message): boolean {
    return (
      (this._havingAttachments && delivery.attachments().length > 0) ||
      (!this._havingAttachments && delivery.attachments().length === 0)
    );
  }

  /** @internal */
  protected isMatchesOnAttachments(delivery: Message): unknown {
    return this._attachments.reduce<unknown>((sentAttachments, attachment, index) => {
      return (
        sentAttachments != null &&
        sentAttachments !== false &&
        attachment.caseEquals(delivery.attachments()[index] ?? null)
      );
    }, true);
  }

  /** @internal */
  protected isMatchesOnBody(delivery: Message): boolean {
    return delivery.body().equals(this._body);
  }

  /** @internal */
  protected isMatchesOnBodyMatcher(delivery: Message): unknown {
    return (delivery.body().rawSource as string).match(this._bodyMatcher);
  }

  /** @internal */
  protected isMatchesOnHtmlPartBody(delivery: Message): boolean {
    return (delivery.htmlPart() as Message).body().equals(this._htmlPartBody);
  }

  /** @internal */
  protected isMatchesOnTextPartBody(delivery: Message): boolean {
    return (delivery.textPart() as Message).body().equals(this._textPartBody);
  }

  /** @internal */
  protected explainExpectations(): string {
    let result = "";
    if (Object.hasOwn(this, "_sender")) result += `from ${rbObjAsString(this._sender)} `;
    if (Object.hasOwn(this, "_recipients")) result += `to ${rbInspect(this._recipients)} `;
    if (Object.hasOwn(this, "_copyRecipients")) result += `cc ${rbInspect(this._copyRecipients)} `;
    if (Object.hasOwn(this, "_blindCopyRecipients"))
      result += `bcc ${rbInspect(this._blindCopyRecipients)} `;
    if (Object.hasOwn(this, "_subject"))
      result += `with subject "${rbObjAsString(this._subject)}" `;
    if (Object.hasOwn(this, "_subjectMatcher"))
      result += `with subject matching "${rbObjAsString(this._subjectMatcher)}" `;
    if (Object.hasOwn(this, "_body")) result += `with body "${rbObjAsString(this._body)}" `;
    if (Object.hasOwn(this, "_bodyMatcher"))
      result += `with body matching "${rbObjAsString(this._bodyMatcher)}" `;
    if (Object.hasOwn(this, "_textPartBody"))
      result += `with a text part matching "${rbObjAsString(this._textPartBody)}" `;
    if (Object.hasOwn(this, "_htmlPartBody"))
      result += `with an HTML part matching "${rbObjAsString(this._htmlPartBody)}" `;
    return result;
  }

  /** @internal */
  protected dumpDeliveries(): string {
    return "(actual deliveries: " + rbInspect(Mail.TestMailer.deliveries) + ")";
  }
}

export function haveSentEmail(this: unknown): HasSentEmailMatcher {
  return new HasSentEmailMatcher(this);
}
