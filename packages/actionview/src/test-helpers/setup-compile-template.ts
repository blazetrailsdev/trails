import { LoadError } from "@blazetrails/ruby-compat";
import { setTemplateCompiler } from "../template.js";

export const shippedTemplateCompiler = setTemplateCompiler(
  async (template, methodName, source, file) => {
    if (file) {
      try {
        return await shippedTemplateCompiler(template, methodName, source, file);
      } catch (error) {
        if (!(error instanceof LoadError)) throw error;
      }
    }
    return (await import("./compile-template.js")).compileTemplate(template, source);
  },
);
