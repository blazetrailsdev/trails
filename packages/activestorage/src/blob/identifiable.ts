import { Numeric } from "@blazetrails/activesupport/core-ext/numeric/bytes";
import { Marcel } from "@blazetrails/marcel";
import { Range } from "@blazetrails/ruby-compat";
import type { Blob } from "../blob.js";

async function identify(this: Blob): Promise<void> {
  await this.identifyWithoutSaving();
  await this.saveBang();
}

async function identifyWithoutSaving(this: Blob): Promise<void> {
  if (!this.isIdentified()) {
    this.content_type = await this.identifyContentType();
    this.identified = true;
  }
}

function isIdentified(this: Blob): unknown {
  return this.identified;
}

/** @internal */
async function identifyContentType(this: Blob): Promise<string | null> {
  return Marcel.MimeType.for(await this.downloadIdentifiableChunk(), {
    name: this.filename.toString(),
    declaredType: this.content_type,
  });
}

/** @internal */
async function downloadIdentifiableChunk(this: Blob): Promise<Uint8Array | string> {
  if (this.byte_size! > 0) {
    return await this.service.downloadChunk(this.key, new Range(0, Numeric.kilobytes(4), true));
  } else {
    return "";
  }
}

export const Identifiable = {
  identify,
  identifyWithoutSaving,
  isIdentified,
  identifyContentType,
  downloadIdentifiableChunk,
};
