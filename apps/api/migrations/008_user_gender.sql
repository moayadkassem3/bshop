-- Customers choose Erkek or Kadın at sign-up; Keşfet opens on the matching salon type.
ALTER TABLE users ADD COLUMN gender text CHECK (gender IN ('male', 'female'));
