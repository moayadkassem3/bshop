-- Photo storage in the database, for test hosts whose disk is wiped on restart
-- (PHOTO_STORAGE=database). Production keeps photos on disk or in a bucket.
CREATE TABLE photo_blobs (
  key text PRIMARY KEY,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
