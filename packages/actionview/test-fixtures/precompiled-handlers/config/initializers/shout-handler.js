import { Template } from "@blazetrails/actionview";

Template.registerTemplateHandler("shout", {
  call(_template, source) {
    return `return htmlSafe(${JSON.stringify(source.toUpperCase())});`;
  },
});
