import { Module } from "@blazetrails/ruby-compat";

export const PdfHelper = new Module().include({
  foobar(): string {
    return "baz";
  },
});
