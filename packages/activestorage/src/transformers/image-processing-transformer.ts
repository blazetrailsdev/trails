import { camelize, isPresent, underscore } from "@blazetrails/activesupport";
import { ImageProcessing, type ChainableHost } from "@blazetrails/image-processing";
import {
  ArgumentError,
  isPlainHash,
  rbModConstGet,
  StandardError,
  type Tempfile,
} from "@blazetrails/ruby-compat";
import { ActiveStorage, Transformers } from "../active-storage.js";
import { Transformer } from "./transformer.js";

export class UnsupportedImageProcessingMethod extends StandardError {}
export class UnsupportedImageProcessingArgument extends StandardError {}

export class ImageProcessingTransformer extends Transformer {
  static UnsupportedImageProcessingMethod = UnsupportedImageProcessingMethod;
  static UnsupportedImageProcessingArgument = UnsupportedImageProcessingArgument;

  /**
   * @internal
   * @inventedArm loadPath — PERMANENT
   */
  protected override async process(
    file: unknown,
    { format }: { format: string },
  ): Promise<Tempfile> {
    await ImageProcessing.loadPath[camelize(String(ActiveStorage.variantProcessor))]?.();
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

  /**
   * @internal
   * @inventedArm underscore — PERMANENT
   */
  private operations(): [string, unknown][] {
    const list: [string, unknown][] = [];
    for (const [name, argument] of Object.entries(this.transformations)) {
      if (ActiveStorage.variantProcessor === "mini_magick") {
        this.validateTransformation(name, argument);
      }

      if (underscore(name) === "combine_options") {
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
   * @inventedArm underscore — PERMANENT
   */
  private validateTransformation(name: string, argument: unknown): void {
    const methodName = underscore(name.replaceAll("-", "_"));

    if (!ActiveStorage.supportedImageProcessingMethods.some((method) => methodName === method)) {
      throw new UnsupportedImageProcessingMethod(
        "One or more of the provided transformation methods is not supported.",
      );
    }

    if (isPresent(argument)) {
      if (typeof argument === "string") {
        this.validateArgString(argument);
      } else if (Array.isArray(argument)) {
        this.validateArgArray(argument);
      } else if (isPlainHash(argument)) {
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
      } else if (isPlainHash(arg)) {
        this.validateArgHash(arg);
      }
    }
  }

  /** @internal */
  private validateArgHash(argument: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(argument)) {
      this.validateArgString(key);

      if (typeof value === "number") {
        continue;
      } else if (typeof value === "string") {
        this.validateArgString(value);
      } else if (Array.isArray(value)) {
        this.validateArgArray(value);
      } else if (isPlainHash(value)) {
        this.validateArgHash(value);
      }
    }
  }
}

Transformers.ImageProcessingTransformer = ImageProcessingTransformer;
