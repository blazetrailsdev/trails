import { defineConfig } from "vitepress";

const siteRoot = process.env.SITE_ROOT || "https://frontiers.deanoftech.com";

export default defineConfig({
  title: "BlazeTrails",
  description: "Rails API for TypeScript",
  base: "/docs/",
  outDir: "../build/docs",
  cleanUrls: true,

  themeConfig: {
    siteTitle: "BlazeTrails",
    nav: [
      { text: "Docs", link: "/" },
      { text: "Guides", link: "/guides/" },
      { text: "Website", link: siteRoot },
      { text: "API Reference", link: "/api/@blazetrails/arel/README" },
    ],

    sidebar: {
      "/guides/": [
        {
          text: "Overview",
          items: [
            { text: "Guides", link: "/guides/" },
            { text: "Trails Idioms", link: "/guides/idioms" },
          ],
        },
        {
          text: "Rails Deviations",
          items: [
            { text: "Arel", link: "/guides/arel-rails-deviations" },
            { text: "ActiveModel", link: "/guides/activemodel-rails-deviations" },
            { text: "ActiveRecord", link: "/guides/activerecord-rails-deviations" },
          ],
        },
      ],
      "/api/": [
        {
          text: "Packages",
          items: [
            { text: "Arel", link: "/api/@blazetrails/arel/README" },
            { text: "ActiveModel", link: "/api/@blazetrails/activemodel/README" },
            { text: "ActiveRecord", link: "/api/@blazetrails/activerecord/README" },
            { text: "ActiveSupport", link: "/api/@blazetrails/activesupport/README" },
            { text: "Rack", link: "/api/@blazetrails/rack/README" },
            { text: "ActionPack", link: "/api/@blazetrails/actionpack/README" },
          ],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/blazetrailsdev/trails" }],

    search: {
      provider: "local",
    },
  },
});
