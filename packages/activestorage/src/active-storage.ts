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
    "adaptive_blur",
    "adaptive_resize",
    "adaptive_sharpen",
    "adjoin",
    "affine",
    "alpha",
    "annotate",
    "antialias",
    "append",
    "apply",
    "attenuate",
    "authenticate",
    "auto_gamma",
    "auto_level",
    "auto_orient",
    "auto_threshold",
    "backdrop",
    "background",
    "bench",
    "bias",
    "bilateral_blur",
    "black_point_compensation",
    "black_threshold",
    "blend",
    "blue_primary",
    "blue_shift",
    "blur",
    "border",
    "bordercolor",
    "borderwidth",
    "brightness_contrast",
    "cache",
    "canny",
    "caption",
    "channel",
    "channel_fx",
    "charcoal",
    "chop",
    "clahe",
    "clamp",
    "clip",
    "clip_path",
    "clone",
    "clut",
    "coalesce",
    "colorize",
    "colormap",
    "color_matrix",
    "colors",
    "colorspace",
    "colourspace",
    "color_threshold",
    "combine",
    "combine_options",
    "comment",
    "compare",
    "complex",
    "compose",
    "composite",
    "compress",
    "connected_components",
    "contrast",
    "contrast_stretch",
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
    "dissimilarity_threshold",
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
    "evaluate_sequence",
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
    "gaussian_blur",
    "geometry",
    "gravity",
    "grayscale",
    "green_primary",
    "hald_clut",
    "highlight_color",
    "hough_lines",
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
    "interline_spacing",
    "interpolate",
    "interpolative_resize",
    "interword_spacing",
    "kerning",
    "kmeans",
    "kuwahara",
    "label",
    "lat",
    "layers",
    "level",
    "level_colors",
    "limit",
    "limits",
    "linear_stretch",
    "linewidth",
    "liquid_rescale",
    "list",
    "loader",
    "log",
    "loop",
    "lowlight_color",
    "magnify",
    "map",
    "mattecolor",
    "median",
    "mean_shift",
    "metric",
    "mode",
    "modulate",
    "moments",
    "monitor",
    "monochrome",
    "morph",
    "morphology",
    "mosaic",
    "motion_blur",
    "name",
    "negate",
    "noise",
    "normalize",
    "opaque",
    "ordered_dither",
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
    "radial_blur",
    "raise",
    "random_threshold",
    "range_threshold",
    "red_primary",
    "regard_warnings",
    "region",
    "remote",
    "render",
    "repage",
    "resample",
    "resize",
    "resize_to_fill",
    "resize_to_fit",
    "resize_to_limit",
    "resize_and_pad",
    "respect_parentheses",
    "reverse",
    "roll",
    "rotate",
    "sample",
    "sampling_factor",
    "saver",
    "scale",
    "scene",
    "screen",
    "seed",
    "segment",
    "selective_blur",
    "separate",
    "sepia_tone",
    "shade",
    "shadow",
    "shared_memory",
    "sharpen",
    "shave",
    "shear",
    "sigmoidal_contrast",
    "silent",
    "similarity_threshold",
    "size",
    "sketch",
    "smush",
    "snaps",
    "solarize",
    "sort_pixels",
    "sparse_color",
    "splice",
    "spread",
    "statistic",
    "stegano",
    "stereo",
    "storage_type",
    "stretch",
    "strip",
    "stroke",
    "strokewidth",
    "style",
    "subimage_search",
    "swap",
    "swirl",
    "synchronize",
    "taint",
    "text_font",
    "threshold",
    "thumbnail",
    "tile_offset",
    "tint",
    "title",
    "transform",
    "transparent",
    "transparent_color",
    "transpose",
    "transverse",
    "treedepth",
    "trim",
    "type",
    "undercolor",
    "unique_colors",
    "units",
    "unsharp",
    "update",
    "valid_image",
    "view",
    "vignette",
    "virtual_pixel",
    "visual",
    "watermark",
    "wave",
    "wavelet_denoise",
    "weight",
    "white_balance",
    "white_point",
    "white_threshold",
    "window",
    "window_group",
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
  loadPath: {} as Record<string, () => Promise<unknown>>,
} as AutoloadModule & {
  Transformer: unknown;
  ImageProcessingTransformer: unknown;
};
ActiveStorage.Transformers = Transformers;
extend(Transformers, Autoload);

Transformers.autoload("Transformer");
Transformers.autoload("ImageProcessingTransformer");
