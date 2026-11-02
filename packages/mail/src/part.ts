import { rbObjAsString, stringSplit } from "@blazetrails/ruby-compat";
import * as Constants from "./constants.js";
import { Header } from "./header.js";
import { Mail } from "./mail.js";
import { Message } from "./message.js";
import { Utilities } from "./utilities.js";

const LAX = Constants.LAX_CRLF.source;
const WSP = Constants.WSP.source;

/* eslint-disable @typescript-eslint/no-explicit-any */
export class Part extends Message {
  /** @internal */
  declare private _deliveryStatusData: Header | undefined;

  addContentId(contentIdVal: unknown = ""): void {
    this.header().set("content-id", contentIdVal);
  }

  hasContentId(): boolean {
    return this.header().hasContentId();
  }

  cid(): string {
    if (!this.hasContentId()) this.addContentId();
    return Utilities.uriEscape(Utilities.unbracket(this.contentId()));
  }

  url(): string {
    return `cid:${this.cid()}`;
  }

  isInline(): boolean | null {
    const field = this.header().get("content_disposition");
    return typeof field?.dispositionType === "function"
      ? field.dispositionType() === "inline"
      : null;
  }

  /** @internal */
  protected override addRequiredFields(): void {
    super.addRequiredFields();
    if (!this.hasContentId() && this.isInline()) this.addContentId();
  }

  /** @internal */
  protected override addRequiredMessageFields(): void {}

  isDeliveryStatusReportPart(): boolean {
    return (
      /message/i.test(this.mainType() ?? "") &&
      /delivery-status/i.test(this.subType() ?? "") &&
      this.body().matchOperator(/Status:/) != null
    );
  }

  deliveryStatusData(): any {
    return this.isDeliveryStatusReportPart() ? this.parseDeliveryStatusReport() : {};
  }

  override isBounced(): boolean {
    const action = this.action() as any;
    return /failed/i.test(
      rbObjAsString(Array.isArray(action) ? (action[0] ?? "") : (action ?? "")),
    );
  }

  override action(): unknown {
    return this.getReturnValues("action");
  }

  override finalRecipient(): unknown {
    return this.getReturnValues("final-recipient");
  }

  override errorStatus(): unknown {
    return this.getReturnValues("status");
  }

  override diagnosticCode(): unknown {
    return this.getReturnValues("diagnostic-code");
  }

  override remoteMta(): unknown {
    return this.getReturnValues("remote-mta");
  }

  override isRetryable(): boolean {
    return !/^5/m.test(rbObjAsString(this.errorStatus() ?? ""));
  }

  /** @internal */
  private getReturnValues(key: string): unknown {
    const value = this.deliveryStatusData().get(key);
    if (Array.isArray(value)) {
      return value.map((a) => a.value);
    } else if (value != null) {
      return value.value;
    } else {
      return null;
    }
  }

  /** @internal */
  protected override parseMessage(): void {
    const [headerPart, bodyPart] = stringSplit(
      this.rawSource,
      new RegExp(`${LAX}${WSP}*${LAX}`, "m"),
      2,
    );
    if (headerPart != null && Constants.HEADER_LINE.test(headerPart)) {
      this.setHeader(headerPart);
      this.setBody(bodyPart ?? null);
    } else {
      this.setHeader("Content-Type: text/plain\r\n");
      this.setBody(this.rawSource);
    }
  }

  /** @internal */
  private parseDeliveryStatusReport(): Header {
    return (this._deliveryStatusData ??= new Header(
      this.body().toString().replaceAll("\r\n\r\n", "\r\n"),
    ));
  }
}
Mail.Part = Part as never;
