const aspecial = '()<>\\[\\]:;@\\\\,."';
const tspecial = '()<>@,;:\\\\"/\\[\\]?=';
const sp = " ";
const control = "\\x00-\\x1f\\x7f-\\uffff";

export const ATOM_UNSAFE = new RegExp(`[${aspecial}${control}${sp}]`);
export const PHRASE_UNSAFE = new RegExp(`[${aspecial}${control}]`);
export const TOKEN_UNSAFE = new RegExp(`[${tspecial}${control}${sp}]`);

export const ENCODED_VALUE = /=\?([^?]+)\?([QB])\?.*?\?=/is;
export const FULL_ENCODED_VALUE = /(=\?[^?]+\?[QB]\?.*?\?=)/is;

export const EMPTY = "";
export const UNDERSCORE = "_";
export const HYPHEN = "-";
export const CRLF = "\r\n";
export const LF = "\n";
export const SPACE = " ";

export const Q_VALUES = ["Q", "q"];
export const B_VALUES = ["B", "b"];
