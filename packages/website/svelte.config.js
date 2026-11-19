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
        if (path.startsWith(`${process.env.SITE_BASE ?? ""}/docs/`)) return;
        throw new Error(message);
      },
    },
  },
};

export default config;
