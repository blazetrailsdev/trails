import { Module, registerConstant } from "@blazetrails/ruby-compat";

export const PdfHelper = new Module().include({
  foobar(): string {
    return "baz";
  },
});
registerConstant("Fun::PdfHelper", PdfHelper);
