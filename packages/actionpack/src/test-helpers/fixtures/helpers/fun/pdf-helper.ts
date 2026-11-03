import {
  constGet,
  constSet, TopLevel, isRegisteredConstant } from "@blazetrails/ruby-compat";

export const PdfHelper = {
  foobar(): string {
    return "baz";
  },
};
if (!isRegisteredConstant("Fun")) constSet(TopLevel, "Fun", {});
constSet(constGet(Object, "Fun") as object, "PdfHelper", PdfHelper);
