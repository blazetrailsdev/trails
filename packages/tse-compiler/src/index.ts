export { tokenize, TseSyntaxError, type Token, type TokenKind } from "./lexer.js";
export { parse, type TseAst, type TseNode } from "./parser.js";
export {
  compileJs,
  ARROW_BLOCK_RE,
  BLOCK_CLOSE_RE,
  awaitFlowReads,
  FUNCTION_BLOCK_RE,
  netBraceDepth,
  netUnclosedParens,
  YIELD_EXPR_RE,
  type EmitJsOptions,
  type EmitResult,
} from "./emit-js.js";
export { parseFilename, type ParsedFilename } from "./parse-filename.js";
export { parseLocalsSignature, LocalsSignatureError, type LocalEntry } from "./parse-locals.js";
export {
  generateSourceMap,
  decodeLineMappings,
  type RawSourceMap,
  type LineMapping,
} from "./source-map.js";
export { parseScript, JsNode, JsParseError, type JsLocation } from "./js-parser.js";
