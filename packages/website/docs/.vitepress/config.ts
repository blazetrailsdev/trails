import { defineConfig } from "vitepress";
import { publishedPackages } from "../../src/lib/parity.js";

const siteBase = process.env.SITE_BASE ?? "";
const siteRoot = process.env.SITE_ROOT || `${siteBase}/`;
const packages = await publishedPackages();

const railsGuideSections = [
  "Start Here",
  "Models",
  "Views",
  "Controllers",
  "Other Components",
  "Digging Deeper",
  "Going to Production",
  "Advanced Active Record",
  "Extending Rails",
];

export default defineConfig({
  title: "BlazeTrails",
  description: "Trails API for TypeScript",
  base: `${siteBase}/docs/`,
  outDir: "../build/docs",
  cleanUrls: true,

  themeConfig: {
    siteTitle: "BlazeTrails",
    nav: [
      { text: "Docs", link: "/" },
      { text: "Guides", link: "/guides/" },
      { text: "Packages", link: "/packages/" },
      { text: "Examples", link: "/examples" },
      { text: "Website", link: siteRoot },
      { text: "API Reference", link: "/api/@blazetrails/arel/README" },
    ],

    sidebar: {
      "/guides/": [
        {
          text: "Overview",
          items: [
            { text: "Guides", link: "/guides/" },
            { text: "Getting Started", link: "/guides/getting-started" },
            { text: "Trails Idioms", link: "/guides/idioms" },
          ],
        },
        {
          text: "Rails Guides",
          items: railsGuideSections.map((text) => ({
            text,
            link: `/guides/#${text.toLowerCase().replace(/ /g, "-")}`,
          })),
        },
        { text: "Contributing", link: "/guides/#contributing" },
      ],
      "/packages/": [
        {
          text: "Packages",
          items: [
            { text: "All packages", link: "/packages/" },
            ...packages.map(({ dir }) => ({ text: dir, link: `/packages/${dir}` })),
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
      options: {
        // Exclude the typedoc-generated API reference from the local
        // search index. Indexing it inflates the search-index chunk to
        // ~17MB and dominates the VitePress bundle phase. The API is
        // navigable via the sidebar; losing in-page search there is the
        // accepted tradeoff for a much smaller, faster build.
        _render(src, env, md) {
          if (env.relativePath?.startsWith("api/")) return "";
          return md.render(src, env);
        },
      },
    },
  },
});
