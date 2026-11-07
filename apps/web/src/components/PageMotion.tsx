import { ViewTransition } from 'react';

// Which animation a page plays for each kind of navigation (see lib/motion.ts):
// untyped ones (browser back, redirects, refreshes) switch instantly.
const BY_TYPE = { 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', 'nav-tab': 'nav-tab', default: 'none' };

/**
 * Page transitions (v1.7). Used by the template files, which Next.js remounts on
 * every navigation, so the old page exits and the new one enters; the tab bar,
 * in the layout, stays put. Browsers without view transitions just switch pages.
 */
export function PageMotion({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={BY_TYPE} exit={BY_TYPE} default="none">
      {children}
    </ViewTransition>
  );
}
