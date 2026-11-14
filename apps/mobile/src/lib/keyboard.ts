import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Keyboard, Platform, TextInput, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';

/**
 * Keeps the field being typed in above the keyboard (founder's report, 8 November 2026).
 * Android draws the app edge to edge (Expo SDK 54), so the screen no longer shrinks when the
 * keyboard opens and fields near the bottom ended up underneath it. A scrolling page that uses
 * this gets room for the keyboard under its content and scrolls the focused field into view,
 * when the keyboard opens and when another field is tapped while it is open.
 */

/** Where the keyboard's top edge is on screen, while it is open. */
let keyboardTop: number | null = null;
const revealers = new Set<() => void>();

const SHOW = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
/** Space kept between the field and the keyboard. */
const GAP = 24;

Keyboard.addListener(SHOW, (e) => {
  keyboardTop = e.endCoordinates.screenY;
});
Keyboard.addListener(HIDE, () => {
  keyboardTop = null;
});

/** Call when a field gets focus: the page holding it scrolls it above the keyboard. */
export function revealFocusedField() {
  // After the keyboard and the extra room have settled.
  setTimeout(() => revealers.forEach((reveal) => reveal()), Platform.OS === 'ios' ? 300 : 120);
}

export function useKeyboardRoom(scroll: RefObject<ScrollView | null>) {
  const [room, setRoom] = useState(0);
  const offset = useRef(0);

  const reveal = useCallback(() => {
    const input = TextInput.State.currentlyFocusedInput();
    const list = scroll.current;
    const listNode = list?.getNativeScrollRef();
    if (!input || !list || !listNode || keyboardTop == null) return;
    const top = keyboardTop;
    // Only the page that holds the field scrolls: measureLayout fails for a field elsewhere.
    input.measureLayout(
      listNode,
      () => {
        input.measureInWindow((_x, y, _w, h) => {
          const overflow = y + h + GAP - top;
          if (overflow > 0) list.scrollTo({ y: offset.current + overflow, animated: true });
        });
      },
      () => undefined,
    );
  }, [scroll]);

  useEffect(() => {
    revealers.add(reveal);
    const show = Keyboard.addListener(SHOW, (e) => {
      setRoom(e.endCoordinates.height);
      revealFocusedField();
    });
    const hide = Keyboard.addListener(HIDE, () => setRoom(0));
    return () => {
      revealers.delete(reveal);
      show.remove();
      hide.remove();
    };
  }, [reveal]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);

  /** `room`: extra bottom padding for the content; pass `onScroll` and `scrollEventThrottle={16}` to the ScrollView. */
  return { room, onScroll };
}
