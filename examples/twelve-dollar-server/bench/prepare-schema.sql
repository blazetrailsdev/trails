CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL, created_at TEXT);
CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, body TEXT, created_at TEXT);
CREATE TABLE likes (id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL);
CREATE INDEX index_posts_on_created_at ON posts (created_at, id);
CREATE INDEX index_likes_on_post_id ON likes (post_id);
