import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from './api';
import type { BusinessShop } from './types';

const SHOP_KEY = 'business-shop';
let selected: string | null = null;
const listeners = new Set<(id: string) => void>();

/** The salons this account works at, and the one the business screens show (remembered). */
export function useBusinessShops() {
  const [shops, setShops] = useState<BusinessShop[] | null>(null);
  const [shopId, setShopId] = useState<string | null>(selected);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api<BusinessShop[]>('/staff/shops');
      if (!selected) selected = await SecureStore.getItemAsync(SHOP_KEY).catch(() => null);
      const id = list.find((s) => s.id === selected)?.id ?? list[0]?.id ?? null;
      selected = id;
      setShops(list);
      setShopId(id);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
    const listener = (id: string) => setShopId(id);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [load]);

  const selectShop = useCallback((id: string) => {
    selected = id;
    SecureStore.setItemAsync(SHOP_KEY, id).catch(() => undefined);
    listeners.forEach((l) => l(id));
  }, []);

  return { shops, shop: shops?.find((s) => s.id === shopId) ?? null, selectShop, error, reload: load };
}
