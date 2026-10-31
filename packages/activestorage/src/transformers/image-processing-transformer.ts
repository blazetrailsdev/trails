import { camelize, isPresent } from "@blazetrails/activesupport";
import type { ChainableHost, ImageProcessing as Namespace } from "@blazetrails/image-processing";
import {
  ArgumentError,
  Hash,
  isPlainHash,
  LoadError,
  rbModConstGet,
  StandardError,
  type Tempfile,
} from "@blazetrails/ruby-compat";
import { ActiveStorage, Transformers } from "../active-storage.js";
import { Transformer } from "./transformer.js";

let ImageProcessing: typeof Namespace;
try {
  ({ ImageProcessing } = await import("@blazetrails/image-processing"));
} catch {
  throw new LoadError(
    'Generating image variants require the image_processing gem. Please add `gem "image_processing", "~> 1.2"` to your Gemfile.',
  );
}

export class UnsupportedImageProcessingMethod extends StandardError {}
export class UnsupportedImageProcessingArgument extends StandardError {}

export class ImageProcessingTransformer extends Transformer {
  static UnsupportedImageProcessingMethod = UnsupportedImageProcessingMethod;
  static UnsupportedImageProcessingArgument = UnsupportedImageProcessingArgument;

  /**
   * @internal
   * @inventedArm loadPath — CONVERGEABLE activestorage-transformer-deviations-ruling
   */
  protected override async process(
    file: unknown,
    { format }: { format: string },
  ): Promise<Tempfile> {
    await ImageProcessing.loadPath[`image_processing/${ActiveStorage.variantProcessor}`]?.();
    return (await this.processor()
      .source(file)
      .loader({ page: 0 })
      .convert(format)
      .apply(this.operations())
      .call()) as Tempfile;
  }

  /** @internal */
  private processor(): ChainableHost {
    return rbModConstGet(
      ImageProcessing,
      camelize(String(ActiveStorage.variantProcessor)),
    ) as ChainableHost;
  }

  /** @internal */
  private operations(): [string, unknown][] {
    const list: [string, unknown][] = [];
    for (const [name, argument] of Object.entries(this.transformations)) {
      if (ActiveStorage.variantProcessor === "mini_magick") {
        this.validateTransformation(name, argument);
      }

      if (name === "combine_options" || name === "combineOptions") {
        throw new ArgumentError(
          "Active Storage's ImageProcessing transformer doesn't support :combine_options, as it always generates a single command.",
        );
      }

      if (isPresent(argument)) {
        list.push([name, argument]);
      }
    }
    return list;
  }

  /**
   * @internal
   * @inventedArm camelize — CONVERGEABLE activestorage-transformer-deviations-ruling
   */
  private validateTransformation(name: string, argument: unknown): void {
    const methodName = name.replaceAll("-", "_");

    if (
      !ActiveStorage.supportedImageProcessingMethods.some(
        (method) => methodName === method || methodName === camelize(method, false),
      )
    ) {
      throw new UnsupportedImageProcessingMethod(
        "One or more of the provided transformation methods is not supported.",
      );
    }

    if (isPresent(argument)) {
      if (typeof argument === "string") {
        this.validateArgString(argument);
      } else if (Array.isArray(argument)) {
        this.validateArgArray(argument);
      } else if (isPlainHash(argument) || argument instanceof Hash) {
        this.validateArgHash(argument);
      }
    }
  }

  /** @internal */
  private validateArgString(argument: string): void {
    const unsupportedArguments = (
      ActiveStorage.unsupportedImageProcessingArguments as string[]
    ).some((badArg) => argument.toLowerCase().includes(badArg));

    if (unsupportedArguments) throw new UnsupportedImageProcessingArgument();
  }

  /** @internal */
  private validateArgArray(argument: unknown[]): void {
    for (const arg of argument) {
      if (typeof arg === "number") {
        continue;
      } else if (typeof arg === "string") {
        this.validateArgString(arg);
      } else if (Array.isArray(arg)) {
        this.validateArgArray(arg);
      } else if (isPlainHash(arg) || arg instanceof Hash) {
        this.validateArgHash(arg);
      }
    }
  }

  /** @internal */
  private validateArgHash(argument: Record<string, unknown> | Hash<unknown, unknown>): void {
    const pairs = argument instanceof Hash ? argument.toA() : Object.entries(argument);
    for (const [key, value] of pairs) {
      this.validateArgString(String(key));

      if (typeof value === "number") {
        continue;
      } else if (typeof value === "string") {
        this.validateArgString(value);
      } else if (Array.isArray(value)) {
        this.validateArgArray(value);
      } else if (isPlainHash(value) || value instanceof Hash) {
        this.validateArgHash(value);
      }
    }
  }
}

Transformers.ImageProcessingTransformer = ImageProcessingTransformer;
