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
        if (
          ["", "guides/", "guides/idioms", "api/@blazetrails/arel/README"].some(
            (p) => path === docs + p,
          )
        )
          return;
        throw new Error(message);
      },
    },
  },
};

export default config;
