import { Notifications, reverseMerge } from "@blazetrails/activesupport";
import { Marcel } from "@blazetrails/marcel";
import { ArgumentError, Marshal, OpenSSL, rbInspect } from "@blazetrails/ruby-compat";
import type { Tempfile } from "@blazetrails/ruby-compat";
import { ActiveStorage, Transformers } from "./active-storage.js";
import type { ImageProcessingTransformer } from "./transformers/image-processing-transformer.js";

type Transformations = { [k: string]: unknown };

export class Variation {
  readonly transformations: Transformations;

  static wrap(variator: Variation | string | Transformations): Variation {
    if (variator instanceof this) {
      return variator;
    } else if (typeof variator === "string") {
      return this.decode(variator);
    } else {
      return new this(variator);
    }
  }

  static decode(key: string): Variation {
    return new this(
      ActiveStorage.verifier.verify(key, { purpose: "variation" }) as Transformations,
    );
  }

  static encode(transformations: Transformations): string {
    return ActiveStorage.verifier.generate(transformations, { purpose: "variation" });
  }

  constructor(transformations: Transformations) {
    this.transformations = transformations;
  }

  defaultTo(defaults: Transformations): Variation {
    return new (this.constructor as typeof Variation)(reverseMerge(this.transformations, defaults));
  }

  /** @inventedArm loadPath — PERMANENT */
  async transform<T>(file: unknown, block: (output: Tempfile) => T): Promise<Awaited<T>> {
    await Transformers.loadPath["active_storage/transformers/image_processing_transformer"]();
    return await Notifications.instrument("transform.active_storage", {}, async () => {
      return await this.transformer().transform(file, { format: this.format }, block);
    });
  }

  get format(): string {
    const transformations = this.transformations;
    const format = (
      Object.hasOwn(transformations, "format") ? transformations.format : "png"
    ) as string;
    if (Marcel.Magic.byExtension(format) == null) {
      throw new ArgumentError(`Invalid variant format (${rbInspect(format)})`);
    }
    return format;
  }

  get contentType(): string | null {
    return Marcel.MimeType.for(null, { extension: this.format });
  }

  get key(): string {
    return (this.constructor as typeof Variation).encode(this.transformations);
  }

  get digest(): string {
    return OpenSSL.Digest.SHA1.base64digest(Marshal.dump(this.transformations));
  }

  /** @internal */
  private transformer(): ImageProcessingTransformer {
    const { format: _format, ...transformations } = this.transformations;
    return new (Transformers.ImageProcessingTransformer as typeof ImageProcessingTransformer)(
      transformations,
    );
  }
}
