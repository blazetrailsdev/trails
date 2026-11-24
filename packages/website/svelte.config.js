import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      fallback: "404.html",
    }),
    paths: {
      base: process.env.SITE_BASE ?? "",
    },
    prerender: {
      handleHttpError: ({ path, message }) => {
        const docs = `${process.env.SITE_BASE ?? ""}/docs/`;
        if (path === `${process.env.SITE_BASE ?? ""}/playground/`) return;
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
