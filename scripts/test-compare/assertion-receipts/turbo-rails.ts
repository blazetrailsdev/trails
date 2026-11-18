import type { AssertionReceipt } from "../assertion-receipts.js";

export const turboRails: Record<string, AssertionReceipt[]> = {
  "turbo-rails:frames/frame_request_controller_test.rb › Turbo::FrameRequestViewTest › supports rendering context without request object":
    [
      {
        kind: "assert_dom",
        value: null,
        as: null,
        reason:
          'frame_request_controller_test.rb:67 `assert_dom head, "script"` — the dummy layout\'s only script is `javascript_importmap_tags` (test/dummy/app/views/layouts/application.html.erb:9), and importmap-rails is out of scope (CLAUDE.md, "importmap-rails and propshaft are out of scope"), so the port has no script tag to assert',
      },
    ],
};
