import { camelize } from "@blazetrails/activesupport";
import { BaseController } from "./base-controller.js";
import { Blob } from "./blob.js";

type BlobArgs = Parameters<typeof Blob.createBeforeDirectUploadBang>[0];

export class DirectUploadsController extends BaseController {
  async create(): Promise<void> {
    const blob = await Blob.createBeforeDirectUploadBang({ ...this.blobArgs() });
    await this.render({ json: await this.directUploadJson(blob) });
  }

  /**
   * @internal
   * @inventedArm camelize — PERMANENT
   */
  private blobArgs(): BlobArgs {
    return Object.fromEntries(
      Object.entries(
        (
          this.params.expect({
            blob: ["filename", "byte_size", "checksum", "content_type", { metadata: {} }],
          }) as { toH(): { toHash(): Record<string, unknown> } }
        )
          .toH()
          .toHash(),
      ).map(([key, value]) => [camelize(key, false), value]),
    ) as BlobArgs;
  }

  /** @internal */
  private async directUploadJson(blob: Blob): Promise<Record<string, unknown>> {
    return {
      ...blob.asJson({ root: false, methods: "signedId" }),
      direct_upload: {
        url: await blob.serviceUrlForDirectUpload(),
        headers: blob.serviceHeadersForDirectUpload(),
      },
    };
  }
}
