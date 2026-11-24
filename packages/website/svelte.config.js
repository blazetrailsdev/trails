import adapter from "@sveltejs/adapter-static";

const siteBase = process.env.SITE_BASE ?? "";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      fallback: "404.html",
    }),
    paths: {
      base: siteBase,
    },
    prerender: {
      handleHttpError: ({ path, message }) => {
        const docs = `${siteBase}/docs/`;
        if (path === `${siteBase}/playground/`) return;
        if (
          ["", "guides/", "guides/idioms", "guides/getting-started", "api/README"].some(
            (p) => path === docs + p,
          ) ||
          /^packages\/[a-z0-9-]+$/.test(path.slice(docs.length))
        )
          return;
        throw new Error(message);
      },
    },
  },
};

export default config;
