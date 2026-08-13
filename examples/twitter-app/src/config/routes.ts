import type { Mapper } from "@blazetrails/actionpack";

export function drawRoutes(router: Mapper): void {
  router.root("tweets#index");

  // Sign up.
  router.get("/signup", "users#new");
  router.post("/users", "users#create");

  // Log in / log out.
  router.get("/login", "sessions#new");
  router.post("/login", "sessions#create");
  router.delete("/logout", "sessions#destroy");
  // Browsers can't issue DELETE from a plain form; the log-out link posts.
  router.post("/logout", "sessions#destroy");

  router.resources("tweets", { only: ["index", "new", "create", "show", "destroy"] });

  // Profiles are addressed by handle, not id: /@dean
  router.get("/@:handle", "users#show");
  router.get("/@:handle/following", "users#following");
  router.get("/@:handle/followers", "users#followers");

  router.post("/@:handle/follow", "follows#create");
  router.delete("/@:handle/follow", "follows#destroy");
  router.post("/@:handle/unfollow", "follows#destroy");

  router.post("/tweets/:tweet_id/like", "likes#create");
  router.post("/tweets/:tweet_id/unlike", "likes#destroy");
  router.delete("/tweets/:tweet_id/like", "likes#destroy");
}
