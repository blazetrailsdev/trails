/**
 * The landing page's package grid, grouped as Rails groups its frameworks
 * (RFC 0247 § Design 4). Every published package is placed here by hand;
 * `package-groups.test.ts` fails when one is missing, so a new package is
 * placed deliberately rather than defaulting to a group.
 */
export const PACKAGE_GROUPS: readonly { title: string; packages: readonly string[] }[] = [
  { title: "Models", packages: ["activerecord", "activemodel", "arel"] },
  {
    title: "Controllers & views",
    packages: [
      "actionpack",
      "actionview",
      "rack",
      "rack-cache",
      "rack-cors",
      "rack-proxy",
      "rack-session",
      "rack-test",
      "rackup",
    ],
  },
  {
    title: "Other components",
    packages: [
      "actionmailer",
      "actionmailbox",
      "actiontext",
      "activejob",
      "activestorage",
      "actioncable",
      "activesupport",
      "trailties",
    ],
  },
  {
    title: "Rails 8 defaults",
    packages: [
      "solid-queue",
      "solid-cache",
      "solid-cable",
      "turbo",
      "stimulus",
      "vite-assets",
      "vite-trails",
    ],
  },
  {
    title: "Gems",
    packages: [
      "bcrypt",
      "builder",
      "chronic",
      "date",
      "did-you-mean",
      "et-orbi",
      "fugit",
      "globalid",
      "html-sanitizer",
      "i18n",
      "image-processing",
      "mail",
      "marcel",
      "mini-magick",
      "mini-mime",
      "msgpack",
      "mysql2",
      "net-smtp",
      "nokogiri",
      "pg",
      "raabro",
      "rake",
      "sqlite3",
      "thor",
      "tzinfo",
      "zeitwerk",
    ],
  },
  {
    title: "Tooling",
    packages: ["activerecord-cli", "trails-tsc", "tse-compiler", "vitest-matchers", "ruby-compat"],
  },
];
