import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./transformers/image-processing-transformer.js";
import * as m1 from "./transformers/transformer.js";

registerClassPaths([
  [() => m0.ImageProcessingTransformer, "ActiveStorage::Transformers::ImageProcessingTransformer"],
  [
    () => m0.UnsupportedImageProcessingArgument,
    "ActiveStorage::Transformers::ImageProcessingTransformer::UnsupportedImageProcessingArgument",
  ],
  [
    () => m0.UnsupportedImageProcessingMethod,
    "ActiveStorage::Transformers::ImageProcessingTransformer::UnsupportedImageProcessingMethod",
  ],
  [() => m1.Transformer, "ActiveStorage::Transformers::Transformer"],
]);
