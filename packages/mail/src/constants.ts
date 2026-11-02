const aspecial = '()<>\\[\\]:;@\\\\,."';
const tspecial = '()<>@,;:\\\\"/\\[\\]?=';
const sp = " ";
const control = "\\x00-\\x1f\\x7f-\\uffff";

export const ATOM_UNSAFE = new RegExp(`[${aspecial}${control}${sp}]`);
export const PHRASE_UNSAFE = new RegExp(`[${aspecial}${control}]`);
export const TOKEN_UNSAFE = new RegExp(`[${tspecial}${control}${sp}]`);

export const ENCODED_VALUE = /=\?([^?]+)\?([QB])\?.*?\?=/is;
export const FULL_ENCODED_VALUE = /(=\?[^?]+\?[QB]\?.*?\?=)/is;

export const UNFOLD_WS = /\r?\n([\t ])/g;
export const FIELD_NAME = /[\x21-\x39\x3b-\x7e]+/;
export const HEADER_SPLIT = /\r?\n(?![\t ])/;

export const EMPTY = "";
export const UNDERSCORE = "_";
export const HYPHEN = "-";
export const CRLF = "\r\n";
export const CR = "\r";
export const LF = "\n";
export const CR_ENCODED = "=0D";
export const LF_ENCODED = "=0A";
export const CAPITAL_M = "M";
export const EQUAL_LF = "=\n";
export const SPACE = " ";
export const COLON = ":";

export const Q_VALUES = ["Q", "q"];
export const B_VALUES = ["B", "b"];
