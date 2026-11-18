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
  "turbo-rails:installer_test.rb › InstallerTest › installer": [
    {
      kind: "assert_match",
      value: 's:pin "@hotwired/turbo-rails", to: "turbo.min.js"',
      as: null,
      reason:
        'installer_test.rb:18 `assert_match %(pin "@hotwired/turbo-rails", to: "turbo.min.js"), File.read("config/importmap.rb")` — the importmap arm of turbo:install is not ported and a trails app has no config/importmap.rb (CLAUDE.md, "importmap-rails and propshaft are out of scope")',
    },
  ],
};
