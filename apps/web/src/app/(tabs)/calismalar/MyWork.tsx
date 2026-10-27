'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import gridStyles from '@/components/haircuts/haircuts.module.css';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { uploadImage } from '@/lib/image';
import { getToken } from '@/lib/session';
import { haircutPhotoUrl } from '@/lib/shop';
import type { HaircutPost, HaircutStyle } from '@/lib/types';
import styles from '../randevularim/appointments.module.css';
import biz from '../randevularim/business.module.css';
import own from './calismalar.module.css';

/**
 * Salons share photos of their work (v1.7). Posts appear in Popüler kesimler and
 * on the salon's page; owners remove any post, staff their own.
 */
export function MyWork() {
  const { shops, shop, shopId, selectShop, error: shopsError } = useBusinessShops();
  const [styleList, setStyleList] = useState<HaircutStyle[]>([]);
  const [posts, setPosts] = useState<HaircutPost[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [style, setStyle] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<HaircutStyle[]>('/public/haircut-styles')
      .then(setStyleList)
      .catch(() => setStyleList([]));
  }, []);

  const load = useCallback(async () => {
    if (!shopId) return;
    try {
      setPosts(await api<HaircutPost[]>(`/staff/shops/${shopId}/posts`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function share() {
    if (!file || !style || !shopId) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ style });
      if (caption.trim()) params.set('caption', caption.trim());
      const res = await uploadImage(`/api/staff/shops/${shopId}/posts?${params}`, file, getToken());
      if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).error ?? 'UNKNOWN');
      setFile(null);
      setCaption('');
      if (input.current) input.current.value = '';
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(postId: string) {
    if (!shopId) return;
    try {
      await api(`/staff/shops/${shopId}/posts/${postId}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <header className={`page-header ${styles.header}`}>
        <div className="container narrow">
          <h1>Çalışmalarımız</h1>
          {shops && shops.length > 1 ? (
            <select className={biz.shopSelect} value={shopId ?? ''} aria-label="İşletme" onChange={(e) => selectShop(e.target.value)}>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <p>Kesim fotoğraflarınız Popüler kesimler bölümünde ve salon sayfanızda görünür.</p>
          )}
        </div>
      </header>

      <div className={`container narrow ${styles.body}`}>
        {(error ?? shopsError) && <p className="alert alert-danger">{error ?? shopsError}</p>}
        {shop && (
          <section className={`card ${own.form}`} aria-label="Yeni paylaşım">
            <button type="button" className={own.pick} onClick={() => input.current?.click()}>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Seçilen fotoğraf" />
              ) : (
                <span>
                  <strong>+</strong>
                  Fotoğraf seç
                </span>
              )}
            </button>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div className={own.fields}>
              <div className="field">
                <label htmlFor="w-style">Kesim</label>
                <select id="w-style" className="input" value={style} onChange={(e) => setStyle(e.target.value)}>
                  <option value="">Seçin</option>
                  {(['men', 'women'] as const).map((group) => (
                    <optgroup key={group} label={group === 'men' ? 'Erkek' : 'Kadın'}>
                      {styleList
                        .filter((s) => s.audience === group)
                        .map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="w-caption">Açıklama (isteğe bağlı)</label>
                <input id="w-caption" className="input" maxLength={200} value={caption} placeholder="Örn. Yan taraflar 0 numara" onChange={(e) => setCaption(e.target.value)} />
              </div>
              <button type="button" className="btn btn-primary" disabled={busy || !file || !style} onClick={share}>
                {busy ? 'Paylaşılıyor…' : 'Paylaş'}
              </button>
            </div>
          </section>
        )}

        {posts && posts.length > 0 && (
          <>
            <h2 className={own.title}>Paylaşımlarınız ({posts.length})</h2>
            <div className={gridStyles.grid}>
              {posts.map((p) => (
                <article key={p.id} className={gridStyles.card}>
                  <div className={gridStyles.photoLink}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={haircutPhotoUrl(p.id)} alt="" loading="lazy" className={gridStyles.photo} />
                    <span className={gridStyles.style}>{p.style_name}</span>
                  </div>
                  <div className={gridStyles.footer}>
                    <span className={own.likes}>♥ {p.like_count}</span>
                    <button type="button" className={own.remove} onClick={() => remove(p.id)}>
                      Kaldır
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        {shop?.slug && (
          <p className={own.note}>
            Müşterilerin gördüğü hali: <Link href="/kesimler">Popüler kesimler</Link> · <Link href={`/${shop.slug}`}>Salon sayfanız</Link>
          </p>
        )}
      </div>
    </>
  );
}
