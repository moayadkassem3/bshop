import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useSession } from './session';

/**
 * The haircut posts this customer liked (as on the website), with an instant
 * toggle; someone not signed in is sent to Profil to sign in.
 */
export function useLikes() {
  const { me } = useSession();
  const [liked, setLiked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!me) return setLiked(new Set());
    api<string[]>('/me/likes')
      .then((ids) => setLiked(new Set(ids)))
      .catch(() => undefined);
  }, [me]);

  /** true when it is now liked, false when not, null when signing in is needed first. */
  const toggle = useCallback(
    async (postId: string): Promise<boolean | null> => {
      if (!me) {
        router.push('/profil');
        return null;
      }
      const on = !liked.has(postId);
      const flip = (add: boolean) =>
        setLiked((prev) => {
          const next = new Set(prev);
          if (add) next.add(postId);
          else next.delete(postId);
          return next;
        });
      flip(on);
      try {
        await api(`/me/likes/${postId}`, { method: on ? 'PUT' : 'DELETE' });
        return on;
      } catch {
        flip(!on);
        return !on;
      }
    },
    [liked, me],
  );

  return { liked, toggle };
}
