import { registerConstant } from "@blazetrails/ruby-compat";

export const PdfHelper = {
  foobar(): string {
    return "baz";
  },
};
registerConstant("Fun::PdfHelper", PdfHelper);
