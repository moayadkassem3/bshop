/** The site's public address, for the sitemap and robots.txt (v1.7). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

/** The test deployment shows demo salons and on-screen codes: keep it out of search results. */
export const IS_TEST_SITE = process.env.DEMO_MODE === 'true';
