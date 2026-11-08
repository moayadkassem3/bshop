/**
 * The theme's storage key and the script that applies a dark choice before the page
 * draws (in the root layout's <head>), kept out of the client-only theme module so
 * the server layout gets the plain text.
 */
export const THEME_KEY = 'salon-randevu-tema';

export const THEME_BOOT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.dataset.theme='dark'}catch(e){}`;
