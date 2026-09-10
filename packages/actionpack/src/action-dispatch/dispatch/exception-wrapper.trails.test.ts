import { describe, it, expect } from "vitest";
import { MissingTemplate, TemplateError, type Template } from "@blazetrails/actionview";
import { RoutingError, UnknownFormat } from "../../action-controller/metal/exceptions.js";
import { ExceptionWrapper } from "../exception-wrapper.js";

describe("ExceptionWrapper tables keyed on qualified class names", () => {
  it("rescue_responses maps a raised ActionController::UnknownFormat to :not_acceptable", () => {
    const wrapper = new ExceptionWrapper(null, new UnknownFormat(""));
    expect(wrapper.exceptionClassName).toBe("ActionController::UnknownFormat");
    expect(wrapper.statusCode).toBe(406);
  });

  it("rescue_templates maps a raised ActionView::MissingTemplate to missing_template", () => {
    const wrapper = new ExceptionWrapper(null, new MissingTemplate("posts", "index", "html", []));
    expect(wrapper.rescueTemplate()).toBe("missing_template");
  });

  it("wrapper_exceptions unwraps a raised ActionView::Template::Error to its cause", () => {
    const original = new RoutingError("");
    const error = new TemplateError({ original, template: {} as Template });
    const wrapper = new ExceptionWrapper(null, error);
    expect(wrapper.unwrappedException).toBe(original);
    expect(wrapper.statusCode).toBe(404);
  });

  it("silent_exceptions keeps a raised ActionController::RoutingError off the framework trace", () => {
    const error = new RoutingError("");
    error.stack = "RoutingError\n    at x (/app/node_modules/pkg/index.js:1:1)";
    const wrapper = new ExceptionWrapper(null, error);
    expect(wrapper.exceptionTrace()).toEqual([]);
  });
});
