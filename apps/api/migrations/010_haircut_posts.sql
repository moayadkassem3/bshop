-- "Popüler kesimler" (v1.7): salons post photos of their work, tagged with a
-- style; customers like them. The start of a social section for salons.
CREATE TABLE haircut_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  author_user_id uuid REFERENCES users ON DELETE SET NULL,
  style text NOT NULL,
  caption text,
  storage_key text NOT NULL,
  width int NOT NULL,
  height int NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX haircut_posts_shop_idx ON haircut_posts (shop_id, created_at DESC);
CREATE INDEX haircut_posts_recent_idx ON haircut_posts (created_at DESC);

CREATE TABLE haircut_likes (
  post_id uuid NOT NULL REFERENCES haircut_posts ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX haircut_likes_user_idx ON haircut_likes (user_id);
