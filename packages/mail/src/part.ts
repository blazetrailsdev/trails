import { binaryBytes, binaryString, rbObjAsString, stringSplit } from "@blazetrails/ruby-compat";
import * as Constants from "./constants.js";
import type { ContentDispositionField } from "./fields/content-disposition-field.js";
import type { Field } from "./field.js";
import { Header } from "./header.js";
import { Mail } from "./mail.js";
import { Message } from "./message.js";
import { Utilities } from "./utilities.js";

const LAX = Constants.LAX_CRLF.source;
const WSP = Constants.WSP.source;

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
    return Utilities.uriEscape(Utilities.unbracket(this.contentId() as string));
  }

  url(): string {
    return `cid:${this.cid()}`;
  }

  isInline(): boolean | null {
    const field = this.header().get(
      "content_disposition",
    ) as unknown as ContentDispositionField | null;
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

  isDeliveryStatusReportPart(): number | boolean | null {
    return (
      /message/i.test(this.mainType() ?? "") &&
      /delivery-status/i.test(this.subType() ?? "") &&
      this.body().matchOperator(/Status:/)
    );
  }

  deliveryStatusData(): Header | Record<string, never> {
    return this.isDeliveryStatusReportPart() ? this.parseDeliveryStatusReport() : {};
  }

  override isBounced(): boolean {
    const action = this.action() as string | string[] | null;
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
    const deliveryStatusData = this.deliveryStatusData();
    const value = deliveryStatusData instanceof Header ? deliveryStatusData.get(key) : null;
    if (Array.isArray(value)) {
      return value.map((a: Field) => a.value);
    } else if (value != null) {
      return value.value;
    } else {
      return null;
    }
  }

  /** @internal */
  protected override parseMessage(): void {
    const rawSource = this.rawSource;
    const binary = rawSource instanceof Uint8Array;
    const [headerPart, bodyPart] = stringSplit(
      binary ? binaryString(rawSource) : rawSource,
      new RegExp(`${LAX}${WSP}*${LAX}`, "m"),
      2,
    );
    const bytes = (part: string | undefined) =>
      part == null || !binary ? (part ?? null) : binaryBytes(part);
    if (headerPart != null && Constants.HEADER_LINE.test(headerPart)) {
      this.setHeader(bytes(headerPart));
      this.setBody(bytes(bodyPart));
    } else {
      this.setHeader("Content-Type: text/plain\r\n");
      this.setBody(rawSource);
    }
  }

  /** @internal */
  private parseDeliveryStatusReport(): Header {
    return (this._deliveryStatusData ??= new Header(
      this.body().toString().replaceAll("\r\n\r\n", "\r\n"),
    ));
  }
}
Mail.Part = Part;
