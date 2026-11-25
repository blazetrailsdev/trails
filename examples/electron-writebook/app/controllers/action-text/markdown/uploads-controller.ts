import { minutes, years } from "@blazetrails/activesupport";
import { ActiveStorage, Current as ActiveStorageCurrent } from "@blazetrails/activestorage";
import { GlobalID } from "@blazetrails/globalid";
import { ApplicationController } from "../../application-controller.ts";
import { Book } from "../../../models/book.ts";
import { Page } from "../../../models/page.ts";
import { Markdown } from "../../../../lib/trails-ext/action-text-markdown.ts";

export type Attachment = {
  slug: string;
  filename: { toString(): string };
  contentType: string;
  slugPath(): string;
  url(): Promise<string>;
  record: Promise<{ record?: Promise<{ owningBook?(): Promise<Book | null> }> } | null>;
};

export class UploadsController extends ApplicationController {
  declare record: Page | null;
  declare book: Book | null;
  declare markdown: Markdown;
  declare upload: Attachment;
  declare attachment: Attachment;

  static {
    this.allowUnauthenticatedAccess({ only: "show" });

    this.beforeAction(":setRecord", ":ensureEditable", ":ensureFileUploaded", { only: "create" });
    this.beforeAction(":setAttachment", ":ensureAttachmentReadable", { only: "show" });
  }

  async create(): Promise<void> {
    this.markdown = (await this.record!.safeMarkdownAttribute(
      String(this.params.get("attribute_name")),
    ))!;
    const uploads = (
      this.markdown as unknown as {
        uploads: { attach(files: unknown[]): Promise<void>; attachments(): Promise<Attachment[]> };
      }
    ).uploads;
    await uploads.attach([this.params.get("file")]);
    await this.markdown.saveBang();

    this.upload = (await uploads.attachments()).at(-1)!;

    await this.render({
      json: {
        message: "File uploaded successfully",
        fileName: this.upload.filename.toString(),
        mimetype: this.upload.contentType,
        fileUrl: this.upload.slugPath(),
      },
      status: ":created",
    });
  }

  async show(): Promise<void> {
    if (this.book?.published) {
      this.expiresIn(years(1), { public: true });
    } else {
      this.expiresIn(minutes(5), { public: false });
    }

    await this.redirectToAttachmentPath();
  }

  private async setRecord(): Promise<void> {
    this.record = (await GlobalID.Locator.locateSigned(String(this.params.get("record_gid")), {
      only: Page,
      for: Markdown.UPLOADS_SIGNED_ID_PURPOSE,
    })) as Page | null;
    const owning = await this.record?.owningBook();
    this.book = await Book.accessableOrPublished().findBy({ id: owning?.id ?? null });

    if (!this.book) await this.head(":not_found");
  }

  private async ensureEditable(): Promise<void> {
    if (!(await this.book!.isEditable())) await this.head(":forbidden");
  }

  private async ensureFileUploaded(): Promise<void> {
    if (!this.isUploadedFile(this.params.get("file"))) await this.head(":unprocessable_entity");
  }

  private async setAttachment(): Promise<void> {
    this.attachment = (await ActiveStorage.Attachment!.findByBang({
      slug: `${this.params.get("slug")}.${this.params.get("format")}`,
    })) as unknown as Attachment;
    const record = await this.attachment.record;
    this.book = (await (await record?.record)?.owningBook?.()) ?? null;
  }

  private async ensureAttachmentReadable(): Promise<void> {
    if (!(this.book?.published || (await this.book?.isAccessable()))) await this.head(":not_found");
  }

  private async redirectToAttachmentPath(): Promise<void> {
    await ActiveStorageCurrent.set({ urlOptions: { onlyPath: true } }, async () => {
      await this.head(":found", { location: await this.attachment.url() });
    });
  }
}
