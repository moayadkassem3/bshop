'use client';

import { useEffect } from 'react';

const FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]):not([type=range]):not([type=color]), textarea, select, [contenteditable=true]';
const isField = (el: unknown): el is HTMLElement => el instanceof HTMLElement && el.matches(FIELD);

/**
 * Keeps the field being typed in visible on phones (founder's report, 8 November 2026).
 * While the on-screen keyboard is open, `data-typing` on <html> hides the fixed bottom bars
 * (tab bar, save and continue bars): browsers that shrink the page for the keyboard (in-app
 * browsers, Samsung Internet) otherwise lift them onto the field. The focused field is also
 * scrolled to the middle when the keyboard still covers it.
 */
export function KeyboardGuard() {
  useEffect(() => {
    if (!matchMedia('(pointer: coarse)').matches) return;
    const root = document.documentElement;
    const vv = window.visualViewport;
    // The tallest the visible area has been: the keyboard is open when it is clearly shorter.
    let full = Math.max(vv?.height ?? 0, window.innerHeight);
    let timer: ReturnType<typeof setTimeout> | undefined;

    const keyboardOpen = () => (vv ? vv.height < full - 120 : true);
    const update = () => {
      if (isField(document.activeElement) && keyboardOpen()) root.dataset.typing = '';
      else delete root.dataset.typing;
    };
    const reveal = () => {
      const el = document.activeElement;
      if (!isField(el) || !vv) return;
      const r = el.getBoundingClientRect();
      const top = vv.offsetTop;
      const bottom = vv.offsetTop + vv.height;
      if (r.bottom > bottom - 16 || r.top < top) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const onResize = () => {
      full = Math.max(full, vv?.height ?? 0, window.innerHeight);
      update();
      clearTimeout(timer);
      timer = setTimeout(reveal, 120);
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!isField(e.target)) return;
      update();
      clearTimeout(timer);
      timer = setTimeout(() => {
        update();
        reveal();
      }, 350);
    };
    // Focus may be moving to the next field: decide once it has landed.
    const onFocusOut = () => setTimeout(update, 50);

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    vv?.addEventListener('resize', onResize);
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', onResize);
      window.removeEventListener('resize', onResize);
      delete root.dataset.typing;
    };
  }, []);
  return null;
}
