-- "Kesim fotoğrafı paylaş": a salon can name the cut itself (founder, 14 November 2026).
-- Used with the styles "Diğer" (diger-erkek / diger-kadin); NULL for the listed styles.
ALTER TABLE haircut_posts ADD COLUMN custom_name text;
