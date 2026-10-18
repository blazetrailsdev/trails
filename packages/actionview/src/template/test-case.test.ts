import { describe, it } from "vitest";

describe("GeneralViewTest", () => {
  it.skip("helpers defined on ActionView::TestCase are available", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("memoizes the view", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("exposes params", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("exposes request", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("exposes view as _view for backwards compatibility", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("returns controller_name", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("retrieve non existing config values", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("works without testing a helper module", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("can render a layout with block", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("additional helper classes can be specified as in a controller", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("determine_default_helper_class returns nil if the test name constant resolves to a class", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("delegates notice to request.flash[:notice]", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("delegates alert to request.flash[:alert]", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("uses controller lookup context", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("ClassMethodsTest", () => {
  it.skip("helpers defined on ActionView::TestCase are available", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("tests the specified helper module", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("additional helper classes can be specified as in a controller", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("HelperInclusionTest", () => {
  it.skip("helper class that is being tested is always included in view instance", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("ControllerHelperMethod", () => {
  it.skip("can call a helper method defined on the current controller from a helper", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("AnotherTestClass", () => {
  it.skip("doesn't use controller helpers from other tests", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("ViewAssignsTest", () => {
  it.skip("view_assigns returns a Hash of user defined ivars", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("view_assigns excludes internal ivars", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("HelperExposureTest", () => {
  it.skip("is able to make methods available to the view", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("IgnoreProtectAgainstForgeryTest", () => {
  it.skip("protect_from_forgery? in any helpers returns false", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("ATestHelperTest", () => {
  it.skip("helpers defined on ActionView::TestCase are available", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("inflects the name of the helper module to test from the test case class", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("a configured test controller is available", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("no additional helpers should shared across test cases", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("is able to use routes", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("is able to use named routes", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("is able to use mounted routes", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("named routes can be used from helper included in view", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("is able to render partials with local variables", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("is able to render partials from templates and also use instance variables", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("is able to render partials from templates and also use instance variables after view has been referenced", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("is able to use helpers that depend on the view flow", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("AssertionsTest", () => {
  it.skip("uses the output_buffer for assert_select", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("do not memoize the document_root_element in view tests", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("PlaceholderAssertionsTest", () => {
  it.skip("supports placeholders in assert_select calls", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("CapybaraHTMLEncoderTest", () => {
  it.skip("document_root_element can be configured to utilize Vitest", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("RenderedViewContentTest", () => {
  it.skip("#rendered inherits from String", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("#rendered resets after each render", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("HTMLParserTest", () => {
  it.skip("rendered.html is a Nokogiri::XML::DocumentFragment", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("do not memoize the rendered.html in view tests", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("JSONParserTest", () => {
  it.skip("rendered.json is an ActiveSupport::HashWithIndifferentAccess", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("MissingHTMLParserTest", () => {
  it.skip("rendered.html falls back to returning the value when the parser is missing", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("AHelperWithInitializeTest", () => {
  it.skip("the helper's initialize was actually called", () => {
    // BLOCKED: port-actionview-test-case
  });
});

describe("PatternMatchingTestCases", () => {
  it.skip("document_root_element integrates with pattern matching", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("rendered.html integrates with pattern matching", () => {
    // BLOCKED: port-actionview-test-case
  });
  it.skip("rendered.json integrates with pattern matching", () => {
    // BLOCKED: port-actionview-test-case
  });
});
