/** Working name until the product name is chosen (handoff: "Product name: to be decided"). */
export const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Salon Randevu';

/** Server-side calls go straight to the backend; the browser goes through the /api rewrite. */
export const SERVER_API_URL = process.env.API_URL ?? 'http://localhost:3000';
