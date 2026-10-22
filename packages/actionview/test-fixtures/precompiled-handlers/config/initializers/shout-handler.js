import { TemplateHandlers } from "@blazetrails/actionview";

TemplateHandlers.registerTemplateHandler("shout", {
  call(_template, source) {
    return `return htmlSafe(${JSON.stringify(source.toUpperCase())});`;
  },
});
