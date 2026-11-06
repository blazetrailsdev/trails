import { I18n, indexBy, toQuery } from "@blazetrails/activesupport";
import { AbstractController, DebugView, Mime, MimeType } from "@blazetrails/actionpack";
import { ActionMailer, Preview } from "@blazetrails/actionmailer";
import { Base64, File, rbModName, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { ApplicationController } from "./application-controller.js";
import { Trails } from "./trails.js";

type Message = Awaited<ReturnType<typeof Preview.call>>;
type Part = ReturnType<Message["allParts"]>[number];

export class MailersController extends ApplicationController {
  declare previews: (typeof Preview)[];
  declare pageTitle: string;
  /** @missingRailsName preview — PERMANENT */
  declare _preview: typeof Preview;
  declare emailAction: string;
  declare email: Message;
  declare attachments: Record<string, Part>;
  declare inlineAttachments: Record<string, Part>;
  declare part: Part | Message | null | undefined;

  static override controllerPath(): string {
    return "trails/mailers";
  }

  async index(): Promise<void> {
    this.previews = await Preview.all();
    this.pageTitle = "Action Mailer Previews";
  }

  async download(): Promise<void> {
    this.emailAction = File.basename(this.params.get("path") as string);
    if (this._preview.isEmailExists(this.emailAction)) {
      this.email = await this._preview.call(this.emailAction, this.params as never);
      this.sendData(this.email.toString(), { filename: `${this.emailAction}.eml` });
    } else {
      throw new AbstractController.ActionNotFound(
        `Email '${this.emailAction}' not found in ${rbModName(this._preview)}`,
      );
    }
  }

  async preview(): Promise<void> {
    if (this.params.get("path") === this._preview.previewName()) {
      this.pageTitle = `Action Mailer Previews for ${this._preview.previewName()}`;
      await this.render({ action: "mailer" });
    } else {
      this.emailAction = File.basename(this.params.get("path") as string);

      if (this._preview.isEmailExists(this.emailAction)) {
        this.pageTitle = `Mailer Preview for ${this._preview.previewName()}#${this.emailAction}`;
        this.email = await this._preview.call(this.emailAction, this.params as never);
        this.attachments = Object.fromEntries(
          Object.entries(this.attachmentsFor(this.email)).filter(
            ([_filename, attachment]) => !attachment.isInline(),
          ),
        );
        this.inlineAttachments = Object.fromEntries(
          Object.entries(this.attachmentsFor(this.email)).filter(([_filename, attachment]) =>
            attachment.isInline(),
          ),
        );

        if (this.params.get("part") != null) {
          const partType = MimeType.lookup(this.params.get("part") as string);

          let part;
          if ((part = this.findPart(partType))) {
            this.response.contentType = partType.toString();
            await this.render({
              plain: String(rbObjRespondTo(part, "decoded") ? part.decoded() : part),
            });
          } else {
            throw new AbstractController.ActionNotFound(
              `Email part '${partType}' not found in ${rbModName(this._preview)}#${this.emailAction}`,
            );
          }
        } else {
          this.part = this.findPreferredPart(
            this.request.format() as MimeType,
            Mime.get("html")!,
            Mime.get("text")!,
          );
          await this.render({ action: "email", layout: false, formats: ["html"] });
        }
      } else {
        throw new AbstractController.ActionNotFound(
          `Email '${this.emailAction}' not found in ${rbModName(this._preview)}`,
        );
      }
    }
  }

  /** @internal */
  private isShowPreviews(): boolean | null {
    return ActionMailer.Base.showPreviews;
  }

  /**
   * @internal
   * @missingRailsCall find — PERMANENT
   */
  private async findPreview(): Promise<void> {
    const candidates: string[] = [];
    const path = String(this.params.get("path") ?? "");
    for (const m of path.matchAll(/\/|$/g)) candidates.push(path.slice(0, m.index));
    let preview: string | undefined;
    for (const candidate of candidates) {
      if (await Preview.isExists(candidate)) {
        preview = candidate;
        break;
      }
    }

    if (preview != null) {
      this._preview = (await Preview.find(preview))!;
    } else {
      throw new AbstractController.ActionNotFound(
        `Mailer preview '${this.params.get("path")}' not found`,
      );
    }
  }

  /** @internal */
  private findPreferredPart(...formats: MimeType[]): Part | Message | null {
    for (const format of formats) {
      let part;
      if ((part = this.email.findFirstMimeType(format.toStr()))) {
        return part;
      }
    }

    if (formats.some((f) => f.equals(this.email.mimeType()))) {
      return this.email;
    }
    return null;
  }

  /** @internal */
  private findPart(format: MimeType): Part | Message | null {
    let part;
    if ((part = this.email.findFirstMimeType(format.toStr()))) {
      return part;
    } else if (format.equals(this.email.mimeType())) {
      return this.email;
    }
    return null;
  }

  /** @internal */
  private attachmentsFor(email: Message): Record<string, Part> {
    return indexBy(
      email.allParts().filter((part) => part.isAttachment()),
      (attachment) =>
        String(
          rbObjRespondTo(attachment, "originalFilename")
            ? (attachment as Part & { originalFilename(): unknown }).originalFilename()
            : attachment.filename(),
        ),
    );
  }

  /** @internal */
  private attachmentUrl(attachment: Part): string {
    return `data:application/octet-stream;charset=utf-8;base64,${Base64.encode64(String(attachment.body()))}`;
  }

  /** @internal */
  private partQuery(mimeType: string): string {
    return toQuery({ ...this.request.queryParameters, part: mimeType });
  }

  /** @internal */
  private localeQuery(locale: string): string {
    return toQuery({ ...this.request.queryParameters, locale: locale });
  }

  /** @internal */
  private async setLocale(block: () => Promise<void>): Promise<void> {
    await I18n.withLocale(
      (this.params.get("locale") as string | null | undefined) ?? I18n.defaultLocale(),
      block,
    );
  }
}

MailersController.prependViewPath(DebugView.RESCUES_TEMPLATE_PATHS);

MailersController.aroundAction(":setLocale", { only: ["preview", "download"] });
MailersController.beforeAction(":findPreview", { only: ["preview", "download"] });
MailersController.beforeAction(":requireLocalBang", { unless: ":isShowPreviews" });

MailersController.helperMethod("attachmentUrl", "partQuery", "localeQuery");

MailersController.contentSecurityPolicy(false);

Trails.MailersController = MailersController;
