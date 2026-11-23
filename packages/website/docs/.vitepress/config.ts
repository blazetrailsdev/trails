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
  appearance: false,
  markdown: { theme: "github-dark" },

  themeConfig: {
    siteTitle: false,
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
          text: "Controllers",
          items: [
            { text: "Action Controller Overview", link: "/guides/action-controller-overview" },
            {
              text: "Action Controller Advanced Topics",
              link: "/guides/action-controller-advanced-topics",
            },
            { text: "Trails Routing from the Outside In", link: "/guides/routing" },
          ],
        },
        {
          text: "Models",
          items: [
            { text: "Active Record Basics", link: "/guides/active-record-basics" },
            { text: "Active Record Migrations", link: "/guides/active-record-migrations" },
            { text: "Active Record Validations", link: "/guides/active-record-validations" },
            { text: "Active Record Callbacks", link: "/guides/active-record-callbacks" },
            { text: "Active Record Associations", link: "/guides/association-basics" },
            { text: "Active Record Query Interface", link: "/guides/active-record-querying" },
            { text: "Active Model Basics", link: "/guides/active-model-basics" },
          ],
        },
        {
          text: "Advanced Active Record",
          items: [
            { text: "Active Record Encryption", link: "/guides/active-record-encryption" },
            {
              text: "Composite Primary Keys",
              link: "/guides/active-record-composite-primary-keys",
            },
            { text: "Multiple Databases", link: "/guides/active-record-multiple-databases" },
            { text: "Active Record and PostgreSQL", link: "/guides/active-record-postgresql" },
          ],
        },
        {
          text: "Views",
          items: [
            { text: "Action View Overview", link: "/guides/action-view-overview" },
            { text: "Action View Helpers", link: "/guides/action-view-helpers" },
            { text: "Action View Form Helpers", link: "/guides/form-helpers" },
            { text: "Layouts and Rendering", link: "/guides/layouts-and-rendering" },
          ],
        },
        {
          text: "Other Components",
          items: [
            {
              text: "Active Support Core Extensions",
              link: "/guides/active-support-core-extensions",
            },
            { text: "Action Mailer Basics", link: "/guides/action-mailer-basics" },
            { text: "Action Mailbox Basics", link: "/guides/action-mailbox-basics" },
            { text: "Action Text Overview", link: "/guides/action-text-overview" },
            { text: "Action Cable Overview", link: "/guides/action-cable-overview" },
            { text: "Active Job Basics", link: "/guides/active-job-basics" },
            { text: "Active Storage Overview", link: "/guides/active-storage-overview" },
          ],
        },
        {
          text: "Digging Deeper",
          items: [
            {
              text: "Active Support Instrumentation",
              link: "/guides/active-support-instrumentation",
            },
            { text: "Testing Trails Applications", link: "/guides/testing" },
            { text: "Using Trails for API-only Applications", link: "/guides/api-app" },
            {
              text: "Debugging Trails Applications",
              link: "/guides/debugging-rails-applications",
            },
            { text: "Configuring Trails Applications", link: "/guides/configuring" },
            { text: "The Trails Command Line", link: "/guides/command-line" },
            {
              text: "Autoloading and Reloading",
              link: "/guides/autoloading-and-reloading-constants",
            },
            { text: "Internationalization (I18n) API", link: "/guides/i18n" },
            { text: "The Trails Initialization Process", link: "/guides/initialization" },
            {
              text: "Working with JavaScript in Trails",
              link: "/guides/working-with-javascript-in-rails",
            },
          ],
        },
        {
          text: "Extending Trails",
          items: [
            { text: "The Basics of Creating Trails Plugins", link: "/guides/plugins" },
            { text: "Trails on Rack", link: "/guides/rails-on-rack" },
            { text: "Getting Started with Engines", link: "/guides/engines" },
            {
              text: "Creating and Customizing Trails Generators & Templates",
              link: "/guides/generators",
            },
            { text: "Trails Application Templates", link: "/guides/rails-application-templates" },
            {
              text: "Threading and Code Execution in Trails",
              link: "/guides/threading-and-code-execution",
            },
          ],
        },
        {
          text: "Going to Production",
          items: [
            {
              text: "Tuning Performance for Deployment",
              link: "/guides/tuning-performance-for-deployment",
            },
            { text: "Caching with Trails: An Overview", link: "/guides/caching-with-rails" },
            { text: "Error Reporting in Trails Applications", link: "/guides/error-reporting" },
            { text: "Securing Trails Applications", link: "/guides/security" },
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
