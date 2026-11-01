import {
  Autoload,
  extend,
  mattrAccessor,
  minutes,
  type Duration,
  type Extended,
  type Logger,
} from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import type { Deprecation } from "@blazetrails/activesupport";
import type { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import type { Analyzer } from "./analyzer.js";
import type { Attachment } from "./attachment.js";
import type { Blob } from "./blob.js";
import type * as Errors from "./errors.js";
import type { LogSubscriber } from "./log-subscriber.js";

export type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {};

export const ActiveStorage = { name: "ActiveStorage", loadPath } as AutoloadModule & {
  Attached: unknown;
  Attachment?: typeof Attachment;
  FixtureSet: unknown;
  Service: unknown;
  Previewer: unknown;
  Analyzer: typeof Analyzer;
  Blob?: typeof Blob;
  Transformers: typeof Transformers;
  Error: typeof Errors.Error;
  InvariableError: typeof Errors.InvariableError;
  UnpreviewableError: typeof Errors.UnpreviewableError;
  UnrepresentableError: typeof Errors.UnrepresentableError;
  IntegrityError: typeof Errors.IntegrityError;
  FileNotFoundError: typeof Errors.FileNotFoundError;
  PreviewError: typeof Errors.PreviewError;
  LogSubscriber: typeof LogSubscriber;
  deprecator(): Deprecation;
  logger: Logger | null;
  verifier: MessageVerifier;
  variantProcessor: string;
  queues: Record<string, unknown>;
  previewers: unknown[];
  analyzers: (typeof Analyzer)[];
  paths: Record<string, unknown>;
  variableContentTypes: string[];
  webImageContentTypes: string[];
  binaryContentType: string;
  contentTypesToServeAsBinary: string[];
  contentTypesAllowedInline: string[];
  supportedImageProcessingMethods: string[];
  unsupportedImageProcessingArguments: unknown;
  serviceUrlsExpireIn: Duration;
  touchAttachmentRecords: boolean;
  urlsExpireIn: Duration | null;
  routesPrefix: string;
  drawRoutes: boolean;
  resolveModelToRoute: string;
  trackVariants: boolean;
  videoPreviewArguments: string;
};
extend(ActiveStorage, Autoload);
registerConstant("ActiveStorage", ActiveStorage);

ActiveStorage.autoload("Attached");
ActiveStorage.autoload("FixtureSet");
ActiveStorage.autoload("Service");
ActiveStorage.autoload("Previewer");
ActiveStorage.autoload("Analyzer");

mattrAccessor.call(ActiveStorage, "logger");
mattrAccessor.call(ActiveStorage, "verifier");
mattrAccessor.call(ActiveStorage, "variantProcessor", { default: "mini_magick" });

mattrAccessor.call(ActiveStorage, "queues", { default: {} });

mattrAccessor.call(ActiveStorage, "previewers", { default: [] });
mattrAccessor.call(ActiveStorage, "analyzers", { default: [] });

mattrAccessor.call(ActiveStorage, "paths", { default: {} });

mattrAccessor.call(ActiveStorage, "variableContentTypes", { default: [] });
mattrAccessor.call(ActiveStorage, "webImageContentTypes", { default: [] });
mattrAccessor.call(ActiveStorage, "binaryContentType", { default: "application/octet-stream" });
mattrAccessor.call(ActiveStorage, "contentTypesToServeAsBinary", { default: [] });
mattrAccessor.call(ActiveStorage, "contentTypesAllowedInline", { default: [] });

mattrAccessor.call(ActiveStorage, "supportedImageProcessingMethods", {
  default: [
    "adaptiveBlur",
    "adaptiveResize",
    "adaptiveSharpen",
    "adjoin",
    "affine",
    "alpha",
    "annotate",
    "antialias",
    "append",
    "apply",
    "attenuate",
    "authenticate",
    "autoGamma",
    "autoLevel",
    "autoOrient",
    "autoThreshold",
    "backdrop",
    "background",
    "bench",
    "bias",
    "bilateralBlur",
    "blackPointCompensation",
    "blackThreshold",
    "blend",
    "bluePrimary",
    "blueShift",
    "blur",
    "border",
    "bordercolor",
    "borderwidth",
    "brightnessContrast",
    "cache",
    "canny",
    "caption",
    "channel",
    "channelFx",
    "charcoal",
    "chop",
    "clahe",
    "clamp",
    "clip",
    "clipPath",
    "clone",
    "clut",
    "coalesce",
    "colorize",
    "colormap",
    "colorMatrix",
    "colors",
    "colorspace",
    "colourspace",
    "colorThreshold",
    "combine",
    "combineOptions",
    "comment",
    "compare",
    "complex",
    "compose",
    "composite",
    "compress",
    "connectedComponents",
    "contrast",
    "contrastStretch",
    "convert",
    "convolve",
    "copy",
    "crop",
    "cycle",
    "deconstruct",
    "define",
    "delay",
    "delete",
    "density",
    "depth",
    "descend",
    "deskew",
    "despeckle",
    "direction",
    "displace",
    "dispose",
    "dissimilarityThreshold",
    "dissolve",
    "distort",
    "dither",
    "draw",
    "duplicate",
    "edge",
    "emboss",
    "encoding",
    "endian",
    "enhance",
    "equalize",
    "evaluate",
    "evaluateSequence",
    "extent",
    "extract",
    "family",
    "features",
    "fft",
    "fill",
    "filter",
    "flatten",
    "flip",
    "floodfill",
    "flop",
    "font",
    "foreground",
    "format",
    "frame",
    "function",
    "fuzz",
    "fx",
    "gamma",
    "gaussianBlur",
    "geometry",
    "gravity",
    "grayscale",
    "greenPrimary",
    "haldClut",
    "highlightColor",
    "houghLines",
    "iconGeometry",
    "iconic",
    "identify",
    "ift",
    "illuminant",
    "immutable",
    "implode",
    "insert",
    "intensity",
    "intent",
    "interlace",
    "interlineSpacing",
    "interpolate",
    "interpolativeResize",
    "interwordSpacing",
    "kerning",
    "kmeans",
    "kuwahara",
    "label",
    "lat",
    "layers",
    "level",
    "levelColors",
    "limit",
    "limits",
    "linearStretch",
    "linewidth",
    "liquidRescale",
    "list",
    "loader",
    "log",
    "loop",
    "lowlightColor",
    "magnify",
    "map",
    "mattecolor",
    "median",
    "meanShift",
    "metric",
    "mode",
    "modulate",
    "moments",
    "monitor",
    "monochrome",
    "morph",
    "morphology",
    "mosaic",
    "motionBlur",
    "name",
    "negate",
    "noise",
    "normalize",
    "opaque",
    "orderedDither",
    "orient",
    "page",
    "paint",
    "pause",
    "perceptible",
    "ping",
    "pointsize",
    "polaroid",
    "poly",
    "posterize",
    "precision",
    "preview",
    "process",
    "quality",
    "quantize",
    "quiet",
    "radialBlur",
    "raise",
    "randomThreshold",
    "rangeThreshold",
    "redPrimary",
    "regardWarnings",
    "region",
    "remote",
    "render",
    "repage",
    "resample",
    "resize",
    "resizeToFill",
    "resizeToFit",
    "resizeToLimit",
    "resizeAndPad",
    "respectParentheses",
    "reverse",
    "roll",
    "rotate",
    "sample",
    "samplingFactor",
    "saver",
    "scale",
    "scene",
    "screen",
    "seed",
    "segment",
    "selectiveBlur",
    "separate",
    "sepiaTone",
    "shade",
    "shadow",
    "sharedMemory",
    "sharpen",
    "shave",
    "shear",
    "sigmoidalContrast",
    "silent",
    "similarityThreshold",
    "size",
    "sketch",
    "smush",
    "snaps",
    "solarize",
    "sortPixels",
    "sparseColor",
    "splice",
    "spread",
    "statistic",
    "stegano",
    "stereo",
    "storageType",
    "stretch",
    "strip",
    "stroke",
    "strokewidth",
    "style",
    "subimageSearch",
    "swap",
    "swirl",
    "synchronize",
    "taint",
    "textFont",
    "threshold",
    "thumbnail",
    "tileOffset",
    "tint",
    "title",
    "transform",
    "transparent",
    "transparentColor",
    "transpose",
    "transverse",
    "treedepth",
    "trim",
    "type",
    "undercolor",
    "uniqueColors",
    "units",
    "unsharp",
    "update",
    "validImage",
    "view",
    "vignette",
    "virtualPixel",
    "visual",
    "watermark",
    "wave",
    "waveletDenoise",
    "weight",
    "whiteBalance",
    "whitePoint",
    "whiteThreshold",
    "window",
    "windowGroup",
  ],
});
mattrAccessor.call(ActiveStorage, "unsupportedImageProcessingArguments");

mattrAccessor.call(ActiveStorage, "serviceUrlsExpireIn", { default: minutes(5) });
mattrAccessor.call(ActiveStorage, "touchAttachmentRecords", { default: true });
mattrAccessor.call(ActiveStorage, "urlsExpireIn");

mattrAccessor.call(ActiveStorage, "routesPrefix", { default: "/rails/active_storage" });
mattrAccessor.call(ActiveStorage, "drawRoutes", { default: true });
mattrAccessor.call(ActiveStorage, "resolveModelToRoute", { default: "rails_storage_redirect" });

mattrAccessor.call(ActiveStorage, "trackVariants", { default: false });

mattrAccessor.call(ActiveStorage, "videoPreviewArguments", { default: "-y -vframes 1 -f image2" });

export const Transformers = {
  name: "ActiveStorage::Transformers",
  loadPath: {
    "active_storage/transformers/transformer": () => import("./transformers/transformer.js"),
    "active_storage/transformers/image_processing_transformer": () =>
      import("./transformers/image-processing-transformer.js"),
  } as Record<string, () => Promise<unknown>>,
} as AutoloadModule & {
  Transformer: unknown;
  ImageProcessingTransformer: unknown;
};
ActiveStorage.Transformers = Transformers;
extend(Transformers, Autoload);

Transformers.autoload("Transformer");
Transformers.autoload("ImageProcessingTransformer");
