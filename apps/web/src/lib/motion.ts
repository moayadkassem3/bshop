/**
 * Page transition types (v1.7), passed to <Link transitionTypes> so the page
 * motion matches where the person is going: deeper slides in from the right,
 * back slides in from the left, a tab or filter switch only fades, the search
 * screen grows out of the search bar. Navigations
 * without a type (browser back, redirects) switch instantly. See globals.css.
 */
export const FORWARD = ['nav-forward'];
export const BACK = ['nav-back'];
export const TAB = ['nav-tab'];
export const EXPAND = ['nav-expand'];
