import { Errno, include, rbEqual, type Included } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "./active-storage.js";
import { BaseController } from "./base-controller.js";
import { Blob } from "./blob.js";
import { IntegrityError } from "./errors.js";
import { FileServer } from "./file-server.js";
import type { DiskService } from "./service/disk-service.js";

type Key = {
  key: string;
  disposition: string | null;
  content_type: string | null;
  service_name: string;
};
type Token = {
  key: string;
  content_type: string;
  content_length: number;
  checksum: string;
  service_name: string;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface DiskController extends Included<typeof FileServer> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DiskController extends BaseController {
  static {
    include(this, FileServer);

    this.skipForgeryProtection();
  }

  show(): void {
    try {
      const key = this.decodeVerifiedKey();
      if (key != null) {
        this.serveFile(this.namedDiskService(key.service_name).pathFor(key.key), {
          contentType: key.content_type,
          disposition: key.disposition,
        });
      } else {
        this.head("not_found");
      }
    } catch (error) {
      if (!(error instanceof Errno.ENOENT)) throw error;
      this.head("not_found");
    }
  }

  async update(): Promise<void> {
    try {
      const token = this.decodeVerifiedToken();
      if (token != null) {
        if (this.isAcceptableContent(token)) {
          await this.namedDiskService(token.service_name).upload(token.key, this.request.body, {
            checksum: token.checksum,
          });
          this.head("no_content");
        } else {
          this.head("unprocessable_entity");
        }
      } else {
        this.head("not_found");
      }
    } catch (error) {
      if (!(error instanceof IntegrityError)) throw error;
      this.head("unprocessable_entity");
    }
  }

  /** @internal */
  private namedDiskService(name: string): DiskService {
    return Blob.services.fetch(name, () => {
      return Blob.service;
    }) as DiskService;
  }

  /** @internal */
  private decodeVerifiedKey(): Key | null {
    const key = ActiveStorage.verifier.verified(this.params.get("encoded_key") as string, {
      purpose: "blob_key",
    });
    return key as Key | null;
  }

  /** @internal */
  private decodeVerifiedToken(): Token | null {
    const token = ActiveStorage.verifier.verified(this.params.get("encoded_token") as string, {
      purpose: "blob_token",
    });
    return token as Token | null;
  }

  /** @internal */
  private isAcceptableContent(token: Token): boolean {
    return (
      rbEqual(token.content_type, this.request.contentMimeType) &&
      token.content_length === this.request.contentLength
    );
  }
}
