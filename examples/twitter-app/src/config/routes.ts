import type { Mapper } from "@blazetrails/actionpack";

export function drawRoutes(mapper: Mapper): void {
  mapper.root("tweets#index");

  // Sign up.
  mapper.get("/signup", "users#new");
  mapper.post("/users", "users#create");

  // Log in / log out.
  mapper.get("/login", "sessions#new");
  mapper.post("/login", "sessions#create");
  mapper.delete("/logout", "sessions#destroy");
  // Browsers can't issue DELETE from a plain form; the log-out link posts.
  mapper.post("/logout", "sessions#destroy");

  mapper.resources("tweets", { only: ["index", "new", "create", "show", "destroy"] });

  mapper.get("/explore", "explore#index");
  mapper.get("/hashtags/:name", "hashtags#show");

  // Profiles are addressed by handle, not id: /@dean
  mapper.get("/@:handle", "users#show");
  mapper.get("/@:handle/following", "users#following");
  mapper.get("/@:handle/followers", "users#followers");

  mapper.post("/@:handle/follow", "follows#create");
  mapper.delete("/@:handle/follow", "follows#destroy");
  mapper.post("/@:handle/unfollow", "follows#destroy");

  mapper.post("/tweets/:tweet_id/like", "likes#create");
  mapper.post("/tweets/:tweet_id/unlike", "likes#destroy");
  mapper.delete("/tweets/:tweet_id/like", "likes#destroy");
}
