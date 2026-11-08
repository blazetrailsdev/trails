import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./builder.js";
import * as m1 from "./chainable.js";
import * as m2 from "./image-processing.js";
import * as m3 from "./pipeline.js";
import * as m4 from "./processor.js";

defineConstants([
  [() => m0.Builder, "ImageProcessing::Builder"],
  [() => m1.Chainable, "ImageProcessing::Chainable"],
  [() => m2.Error, "ImageProcessing::Error"],
  [() => m3.Pipeline, "ImageProcessing::Pipeline"],
  [() => m4.Processor, "ImageProcessing::Processor"],
]);
