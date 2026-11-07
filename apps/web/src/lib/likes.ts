'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { getToken } from './session';

/** The posts this customer liked, with an optimistic toggle; signed-out visitors are sent to Profil. */
export function useLikes() {
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    setSignedIn(true);
    api<string[]>('/me/likes')
      .then((ids) => setLiked(new Set(ids)))
      .catch(() => undefined);
  }, []);

  const toggle = useCallback(async (postId: string): Promise<boolean | null> => {
    if (!getToken()) return null;
    const on = !liked.has(postId);
    setLiked((prev) => {
      const next = new Set(prev);
      if (on) next.add(postId);
      else next.delete(postId);
      return next;
    });
    try {
      await api(`/me/likes/${postId}`, { method: on ? 'PUT' : 'DELETE' });
      return on;
    } catch {
      setLiked((prev) => {
        const next = new Set(prev);
        if (on) next.delete(postId);
        else next.add(postId);
        return next;
      });
      return !on;
    }
  }, [liked]);

  return { liked, toggle, signedIn };
}
