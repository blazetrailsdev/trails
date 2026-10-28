import { MetaHelpers } from "../metahelpers.js";

// prettier-ignore
const ACCEPTABLE_ELEMENTS = new Set([
  "a", "abbr", "acronym", "address", "area", "article", "aside", "audio", "b", "bdi", "bdo", "big",
  "blockquote", "br", "button", "canvas", "caption", "center", "cite", "code", "col", "colgroup",
  "command", "datalist", "dd", "del", "details", "dfn", "dir", "div", "dl", "dt", "em", "fieldset",
  "figcaption", "figure", "font", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hr", "i", "img", "input", "ins", "kbd", "label", "legend", "li", "main", "map", "mark", "menu",
  "meter", "nav", "ol", "optgroup", "option", "output", "p", "pre", "q", "s", "samp", "section",
  "select", "small", "span", "strike", "strong", "sub", "summary", "sup", "table", "tbody", "td",
  "textarea", "tfoot", "th", "thead", "time", "tr", "tt", "u", "ul", "var", "video", "wbr",
]);

// prettier-ignore
const MATHML_ELEMENTS = new Set([
  "annotation", "annotation-xml", "maction", "math", "menclose", "merror", "mfenced", "mfrac",
  "mi", "mmultiscripts", "mn", "mo", "mover", "mpadded", "mphantom", "mprescripts", "mroot",
  "mrow", "ms", "mspace", "msqrt", "mstyle", "msub", "msubsup", "msup", "mtable", "mtd", "mtext",
  "mtr", "munder", "munderover", "none", "semantics",
]);

// prettier-ignore
const SVG_ELEMENTS = new Set([
  "a", "altGlyph", "animate", "animateColor", "animateMotion", "animateTransform", "circle",
  "clipPath", "cursor", "defs", "desc", "ellipse", "feGaussianBlur", "feImage", "filter",
  "font-face", "font-face-name", "font-face-src", "foreignObject", "g", "glyph", "hkern", "line",
  "linearGradient", "marker", "mask", "metadata", "missing-glyph", "mpath", "path", "pattern",
  "polygon", "polyline", "radialGradient", "rect", "set", "stop", "svg", "switch", "symbol",
  "text", "textPath", "title", "tref", "tspan", "use",
]);

// prettier-ignore
const ACCEPTABLE_ATTRIBUTES = new Set([
  "abbr", "accept", "accept-charset", "accesskey", "action", "align", "alt", "axis", "border",
  "cellpadding", "cellspacing", "char", "charoff", "charset", "checked", "cite", "class", "clear",
  "color", "cols", "colspan", "compact", "contenteditable", "coords", "datetime", "dir",
  "disabled", "enctype", "for", "frame", "headers", "height", "href", "hreflang", "hspace", "id",
  "ismap", "label", "lang", "longdesc", "loop", "loopcount", "loopend", "loopstart", "maxlength",
  "media", "method", "multiple", "name", "nohref", "noshade", "nowrap", "poster", "preload",
  "prompt", "readonly", "rel", "rev", "rows", "rowspan", "rules", "scope", "selected", "shape",
  "size", "span", "src", "start", "style", "summary", "tabindex", "target", "title", "type",
  "usemap", "valign", "value", "vspace", "width", "xml:lang",
]);

// prettier-ignore
const MATHML_ATTRIBUTES = new Set([
  "actiontype", "align", "close", "columnalign", "columnlines", "columnspacing", "columnspan",
  "depth", "dir", "display", "displaystyle", "encoding", "equalcolumns", "equalrows", "fence",
  "fontstyle", "fontweight", "frame", "height", "href", "linethickness", "lquote", "lspace",
  "mathbackground", "mathcolor", "mathsize", "mathvariant", "maxsize", "minsize", "notation",
  "open", "other", "rowalign", "rowlines", "rowspacing", "rowspan", "rquote", "rspace",
  "scriptlevel", "selection", "separator", "separators", "stretchy", "width", "xlink:href",
  "xlink:show", "xlink:type", "xmlns", "xmlns:xlink",
]);

// prettier-ignore
const SVG_ATTRIBUTES = new Set([
  "accent-height", "accumulate", "additive", "alphabetic", "arabic-form", "ascent",
  "attributeName", "attributeType", "baseProfile", "bbox", "begin", "calcMode", "cap-height",
  "class", "clip-path", "clip-rule", "color", "color-interpolation-filters", "color-profile",
  "color-rendering", "content", "cursor", "cx", "cy", "d", "descent", "display", "dur", "dx", "dy",
  "end", "fill", "fill-opacity", "fill-rule", "filter", "filterRes", "filterUnits", "font-family",
  "font-size", "font-stretch", "font-style", "font-variant", "font-weight", "fx", "fy", "g1", "g2",
  "glyph-name", "gradientUnits", "hanging", "height", "horiz-adv-x", "horiz-origin-x", "id",
  "ideographic", "k", "keyPoints", "keySplines", "keyTimes", "lang", "marker", "marker-end",
  "marker-mid", "marker-start", "markerHeight", "markerUnits", "markerWidth", "mask",
  "maskContentUnits", "maskUnits", "mathematical", "max", "method", "min", "name", "offset",
  "opacity", "orient", "origin", "overline-position", "overline-thickness", "panose-1", "path",
  "pathLength", "patternContentUnits", "patternTransform", "patternUnits", "points",
  "preserveAspectRatio", "primitiveUnits", "r", "refX", "refY", "repeatCount", "repeatDur",
  "requiredExtensions", "requiredFeatures", "restart", "rotate", "rx", "ry", "slope", "spacing",
  "startOffset", "stdDeviation", "stemh", "stemv", "stop-color", "stop-opacity",
  "strikethrough-position", "strikethrough-thickness", "stroke", "stroke-dasharray",
  "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity",
  "stroke-width", "systemLanguage", "target", "text-anchor", "transform", "type", "u1", "u2",
  "underline-position", "underline-thickness", "unicode", "unicode-range", "units-per-em",
  "version", "viewBox", "visibility", "width", "widths", "x", "x-height", "x1", "x2",
  "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title",
  "xlink:type", "xml:base", "xml:lang", "xml:space", "xmlns", "xmlns:xlink", "y", "y1", "y2",
  "zoomAndPan",
]);

// prettier-ignore
const ARIA_ATTRIBUTES = new Set([
  "aria-activedescendant", "aria-atomic", "aria-autocomplete", "aria-braillelabel",
  "aria-brailleroledescription", "aria-busy", "aria-checked", "aria-colcount", "aria-colindex",
  "aria-colindextext", "aria-colspan", "aria-controls", "aria-current", "aria-describedby",
  "aria-description", "aria-details", "aria-disabled", "aria-dropeffect", "aria-errormessage",
  "aria-expanded", "aria-flowto", "aria-grabbed", "aria-haspopup", "aria-hidden", "aria-invalid",
  "aria-keyshortcuts", "aria-label", "aria-labelledby", "aria-level", "aria-live",
  "aria-multiline", "aria-multiselectable", "aria-orientation", "aria-owns", "aria-placeholder",
  "aria-posinset", "aria-pressed", "aria-readonly", "aria-relevant", "aria-required",
  "aria-roledescription", "aria-rowcount", "aria-rowindex", "aria-rowindextext", "aria-rowspan",
  "aria-selected", "aria-setsize", "aria-sort", "aria-valuemax", "aria-valuemin", "aria-valuenow",
  "aria-valuetext", "role",
]);

// prettier-ignore
const ATTR_VAL_IS_URI = new Set([
  "action", "cite", "href", "longdesc", "poster", "preload", "src", "xlink:href", "xml:base",
]);

// prettier-ignore
const SVG_ATTR_VAL_ALLOWS_REF = new Set([
  "clip-path", "color-profile", "cursor", "fill", "filter", "marker", "marker-end", "marker-mid",
  "marker-start", "mask", "stroke",
]);

// prettier-ignore
const SVG_ALLOW_LOCAL_HREF = new Set([
  "altGlyph", "animate", "animateColor", "animateMotion", "animateTransform", "cursor", "feImage",
  "filter", "linearGradient", "pattern", "radialGradient", "set", "textpath", "tref", "use",
]);

// prettier-ignore
const ACCEPTABLE_CSS_PROPERTIES = new Set([
  "azimuth", "align-content", "align-items", "align-self", "aspect-ratio", "background-color",
  "border-bottom-color", "border-collapse", "border-color", "border-left-color",
  "border-right-color", "border-top-color", "clear", "color", "cursor", "direction", "display",
  "elevation", "flex", "flex-basis", "flex-direction", "flex-flow", "flex-grow", "flex-shrink",
  "flex-wrap", "float", "font", "font-family", "font-size", "font-style", "font-variant",
  "font-weight", "height", "justify-content", "letter-spacing", "line-height", "list-style",
  "list-style-type", "max-height", "max-width", "min-height", "min-width", "order", "overflow",
  "overflow-x", "overflow-y", "page-break-after", "page-break-before", "page-break-inside",
  "pause", "pause-after", "pause-before", "pitch", "pitch-range", "richness", "speak",
  "speak-header", "speak-numeral", "speak-punctuation", "speech-rate", "stress", "text-align",
  "text-decoration", "text-indent", "unicode-bidi", "vertical-align", "voice-family", "volume",
  "white-space", "width",
]);

// prettier-ignore
const ACCEPTABLE_CSS_KEYWORDS = new Set([
  "!important", "auto", "block", "bold", "both", "bottom", "center", "collapse", "dashed",
  "dotted", "double", "groove", "hidden", "inherit", "initial", "inset", "italic", "left",
  "medium", "none", "normal", "nowrap", "outset", "pointer", "revert", "ridge", "right",
  "separate", "solid", "thick", "thin", "top", "transparent", "underline", "unset",
]);

// prettier-ignore
const ACCEPTABLE_CSS_COLORS = new Set([
  "aqua", "black", "blue", "fuchsia", "gray", "green", "lime", "maroon", "navy", "olive", "purple",
  "red", "silver", "teal", "white", "yellow",
]);

// prettier-ignore
const ACCEPTABLE_CSS_EXTENDED_COLORS = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black",
  "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse",
  "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan",
  "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta",
  "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
  "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink",
  "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen",
  "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow",
  "grey", "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender",
  "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan",
  "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon",
  "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue",
  "lightyellow", "lime", "limegreen", "linen", "magenta", "maroon", "mediumaquamarine",
  "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue",
  "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream",
  "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange",
  "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred",
  "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "red", "rosybrown",
  "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver",
  "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan",
  "teal", "thistle", "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow",
  "yellowgreen",
]);

// prettier-ignore
const ACCEPTABLE_CSS_FUNCTIONS = new Set([
  "attr", "blur", "brightness", "calc", "circle", "contrast", "counter", "counters",
  "cubic-bezier", "drop-shadow", "ellipse", "grayscale", "hsl", "hsla", "hue-rotate", "hwb",
  "inset", "invert", "linear-gradient", "matrix", "matrix3d", "opacity", "perspective", "polygon",
  "radial-gradient", "repeating-linear-gradient", "repeating-radial-gradient", "rgb", "rgba",
  "rotate", "rotate3d", "rotateX", "rotateY", "rotateZ", "saturate", "sepia", "scale", "scale3d",
  "scaleX", "scaleY", "scaleZ", "skew", "skewX", "skewY", "symbols", "translate", "translate3d",
  "translateX", "translateY", "translateZ",
]);

// prettier-ignore
const SHORTHAND_CSS_PROPERTIES = new Set([
  "background", "border", "margin", "padding",
]);

// prettier-ignore
const ACCEPTABLE_SVG_PROPERTIES = new Set([
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-opacity",
]);

const PROTOCOL_SEPARATOR = /:|(&#0*58)|(&#x70)|(&#x0*3a)|(%|&#37;)3A/i;

// prettier-ignore
const ACCEPTABLE_PROTOCOLS = new Set([
  "afs", "aim", "callto", "data", "ed2k", "fax", "feed", "ftp", "gopher", "http", "https", "irc",
  "line", "mailto", "modem", "news", "nntp", "rsync", "rtsp", "sftp", "sms", "ssh", "tag", "tel",
  "telnet", "urn", "webcal", "xmpp",
]);

// prettier-ignore
const ACCEPTABLE_URI_DATA_MEDIATYPES = new Set([
  "image/gif", "image/jpeg", "image/png", "text/css", "text/plain",
]);

const ALLOWED_ELEMENTS = new Set([...ACCEPTABLE_ELEMENTS, ...MATHML_ELEMENTS, ...SVG_ELEMENTS]);

const ALLOWED_ATTRIBUTES = new Set([
  ...ACCEPTABLE_ATTRIBUTES,
  ...MATHML_ATTRIBUTES,
  ...SVG_ATTRIBUTES,
  ...ARIA_ATTRIBUTES,
]);

const ALLOWED_CSS_PROPERTIES = ACCEPTABLE_CSS_PROPERTIES;

const ALLOWED_CSS_KEYWORDS = new Set([
  ...ACCEPTABLE_CSS_KEYWORDS,
  ...ACCEPTABLE_CSS_COLORS,
  ...ACCEPTABLE_CSS_EXTENDED_COLORS,
]);

const ALLOWED_CSS_FUNCTIONS = ACCEPTABLE_CSS_FUNCTIONS;

const ALLOWED_SVG_PROPERTIES = ACCEPTABLE_SVG_PROPERTIES;

const ALLOWED_PROTOCOLS = ACCEPTABLE_PROTOCOLS;

const ALLOWED_URI_DATA_MEDIATYPES = ACCEPTABLE_URI_DATA_MEDIATYPES;

// prettier-ignore
const VOID_ELEMENTS = new Set([
  "area", "br", "hr", "img", "input",
]);

// prettier-ignore
const TAGS_SAFE_WITH_LIBXML2 = new Set([
  "body", "head", "html",
]);

const ALLOWED_ELEMENTS_WITH_LIBXML2 = new Set([...ALLOWED_ELEMENTS, ...TAGS_SAFE_WITH_LIBXML2]);

export const SafeList = {
  ACCEPTABLE_ELEMENTS,
  MATHML_ELEMENTS,
  SVG_ELEMENTS,
  ACCEPTABLE_ATTRIBUTES,
  MATHML_ATTRIBUTES,
  SVG_ATTRIBUTES,
  ARIA_ATTRIBUTES,
  ATTR_VAL_IS_URI,
  SVG_ATTR_VAL_ALLOWS_REF,
  SVG_ALLOW_LOCAL_HREF,
  ACCEPTABLE_CSS_PROPERTIES,
  ACCEPTABLE_CSS_KEYWORDS,
  ACCEPTABLE_CSS_COLORS,
  ACCEPTABLE_CSS_EXTENDED_COLORS,
  ACCEPTABLE_CSS_FUNCTIONS,
  SHORTHAND_CSS_PROPERTIES,
  ACCEPTABLE_SVG_PROPERTIES,
  PROTOCOL_SEPARATOR,
  ACCEPTABLE_PROTOCOLS,
  ACCEPTABLE_URI_DATA_MEDIATYPES,
  ALLOWED_ELEMENTS,
  ALLOWED_ATTRIBUTES,
  ALLOWED_CSS_PROPERTIES,
  ALLOWED_CSS_KEYWORDS,
  ALLOWED_CSS_FUNCTIONS,
  ALLOWED_SVG_PROPERTIES,
  ALLOWED_PROTOCOLS,
  ALLOWED_URI_DATA_MEDIATYPES,
  VOID_ELEMENTS,
  TAGS_SAFE_WITH_LIBXML2,
  ALLOWED_ELEMENTS_WITH_LIBXML2,
};

/** @deprecated */
export const WhiteList = SafeList;

MetaHelpers.addDowncasedSetMembersToAllSetConstants(SafeList);
