import {
  constGet,
  constSet, TopLevel, constDefined } from "@blazetrails/ruby-compat";

export const PdfHelper = {
  foobar(): string {
    return "baz";
  },
};
if (!constDefined(Object, "Fun")) constSet(TopLevel, "Fun", {});
constSet(constGet(Object, "Fun") as object, "PdfHelper", PdfHelper);
