'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { formatDuration, formatPrice, liraInput, parseLira } from '@/lib/format';
import own from './settings.module.css';

type Service = {
  id: string;
  catalog_service_id: number | null;
  name: string;
  duration_minutes: number;
  price_kurus: number;
  price_is_starting_from: boolean;
  active: boolean;
};
type CatalogItem = { id: number; name: string; duration_minutes: number };
type Draft = { name: string; duration: string; price: string; from: boolean };

const toDraft = (s: Service): Draft => ({
  name: s.name,
  duration: String(s.duration_minutes),
  price: liraInput(s.price_kurus),
  from: s.price_is_starting_from,
});

const draftOk = (d: Draft) => d.name.trim().length >= 2 && Number(d.duration) >= 5 && Number(d.duration) <= 600 && parseLira(d.price) !== null;

/**
 * Hizmetler tab (v1.7): the salon's services and prices. Owners rename, re-price
 * and remove services, and add them from the platform list or their own. A new
 * service is offered by everyone who takes appointments.
 */
export function ServicesTab({ shopId, visible }: { shopId: string; visible: boolean }) {
  const [services, setServices] = useState<Service[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [adding, setAdding] = useState<'catalog' | 'custom' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setServices(await api<Service[]>(`/staff/shops/${shopId}/services`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    if (!draft || !draftOk(draft)) return;
    const ok = await run(() =>
      api(`/staff/shops/${shopId}/services/${id}`, {
        method: 'PATCH',
        body: { name: draft.name.trim(), durationMinutes: Number(draft.duration), priceKurus: parseLira(draft.price), priceIsStartingFrom: draft.from },
      }),
    );
    if (ok) setEditing(null);
  }

  const active = services?.filter((s) => s.active) ?? [];
  const removed = services?.filter((s) => !s.active) ?? [];

  return (
    <div hidden={!visible}>
      {error && <p className="alert alert-danger">{error}</p>}
      <p className={own.intro}>Fiyatları siz belirlersiniz. Süreler varsayılandır; her personel kendi süresini ayarlayabilir.</p>

      <ul className={`card ${own.list}`} role="list">
        {active.map((s) =>
          editing === s.id && draft ? (
            <li key={s.id} className={own.editRow}>
              <ServiceFields draft={draft} onChange={setDraft} idPrefix={`e-${s.id}`} />
              <div className={own.rowActions}>
                <button type="button" className={own.danger} disabled={busy} onClick={() => run(() => api(`/staff/shops/${shopId}/services/${s.id}`, { method: 'PATCH', body: { active: false } }))}>
                  Kaldır
                </button>
                <span />
                <button type="button" className="btn" onClick={() => setEditing(null)} disabled={busy}>
                  Vazgeç
                </button>
                <button type="button" className="btn btn-primary" onClick={() => saveEdit(s.id)} disabled={busy || !draftOk(draft)}>
                  Kaydet
                </button>
              </div>
            </li>
          ) : (
            <li key={s.id}>
              <button
                type="button"
                className={own.row}
                onClick={() => {
                  setEditing(s.id);
                  setDraft(toDraft(s));
                  setAdding(null);
                }}
              >
                <span className={own.rowMain}>
                  <strong>{s.name}</strong>
                  <span>{formatDuration(s.duration_minutes)}</span>
                </span>
                <span className={own.rowPrice}>{formatPrice(s.price_kurus, s.price_is_starting_from)}</span>
                <span className={own.chevron} aria-hidden>
                  ›
                </span>
              </button>
            </li>
          ),
        )}
        {services && active.length === 0 && <li className={own.emptyRow}>Henüz hizmet yok. Aşağıdan ekleyin.</li>}
      </ul>

      {adding === null && (
        <div className={own.addButtons}>
          <button type="button" className="btn" onClick={() => { setAdding('catalog'); setEditing(null); }}>
            + Listeden ekle
          </button>
          <button type="button" className="btn" onClick={() => { setAdding('custom'); setEditing(null); }}>
            + Kendi hizmetiniz
          </button>
        </div>
      )}
      {adding === 'catalog' && (
        <CatalogPicker
          existing={new Set((services ?? []).filter((s) => s.active && s.catalog_service_id).map((s) => s.catalog_service_id!))}
          busy={busy}
          onCancel={() => setAdding(null)}
          onAdd={async (catalogId, priceKurus, from) => {
            if (await run(() => api(`/staff/shops/${shopId}/services/import`, { method: 'POST', body: [{ catalogId, priceKurus, priceIsStartingFrom: from }] }))) setAdding(null);
          }}
        />
      )}
      {adding === 'custom' && (
        <CustomService
          busy={busy}
          onCancel={() => setAdding(null)}
          onAdd={async (d) => {
            const ok = await run(() =>
              api(`/staff/shops/${shopId}/services`, {
                method: 'POST',
                body: { name: d.name.trim(), durationMinutes: Number(d.duration), priceKurus: parseLira(d.price), priceIsStartingFrom: d.from },
              }),
            );
            if (ok) setAdding(null);
          }}
        />
      )}

      {removed.length > 0 && (
        <details className={own.removed}>
          <summary>Kaldırılan hizmetler ({removed.length})</summary>
          <ul className={`card ${own.list}`} role="list">
            {removed.map((s) => (
              <li key={s.id} className={own.removedRow}>
                <span className={own.rowMain}>
                  <strong>{s.name}</strong>
                  <span>{formatPrice(s.price_kurus, s.price_is_starting_from)}</span>
                </span>
                <button type="button" className={own.link} disabled={busy} onClick={() => run(() => api(`/staff/shops/${shopId}/services/${s.id}`, { method: 'PATCH', body: { active: true } }))}>
                  Geri ekle
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ServiceFields({ draft, onChange, idPrefix, nameLocked = false }: { draft: Draft; onChange: (d: Draft) => void; idPrefix: string; nameLocked?: boolean }) {
  return (
    <div className={own.fields}>
      {!nameLocked && (
        <div className="field">
          <label htmlFor={`${idPrefix}-name`}>Hizmet adı</label>
          <input id={`${idPrefix}-name`} className="input" maxLength={80} value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
        </div>
      )}
      <div className={own.pair}>
        <div className="field">
          <label htmlFor={`${idPrefix}-dur`}>Süre (dk)</label>
          <input id={`${idPrefix}-dur`} className="input" inputMode="numeric" value={draft.duration} onChange={(e) => onChange({ ...draft, duration: e.target.value.replace(/\D/g, '') })} />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-price`}>Fiyat (₺)</label>
          <input id={`${idPrefix}-price`} className="input" inputMode="decimal" value={draft.price} onChange={(e) => onChange({ ...draft, price: e.target.value })} />
        </div>
      </div>
      <label className={own.check}>
        <input type="checkbox" checked={draft.from} onChange={(e) => onChange({ ...draft, from: e.target.checked })} />
        Fiyatı “ve üzeri” olarak göster
      </label>
    </div>
  );
}

function CustomService(props: { busy: boolean; onCancel: () => void; onAdd: (d: Draft) => void }) {
  const [draft, setDraft] = useState<Draft>({ name: '', duration: '30', price: '', from: false });
  return (
    <div className={`card ${own.panel}`}>
      <h3>Kendi hizmetiniz</h3>
      <ServiceFields draft={draft} onChange={setDraft} idPrefix="new" />
      <div className={own.panelActions}>
        <button type="button" className="btn" onClick={props.onCancel}>
          Vazgeç
        </button>
        <button type="button" className="btn btn-primary" disabled={props.busy || !draftOk(draft)} onClick={() => props.onAdd(draft)}>
          Ekle
        </button>
      </div>
    </div>
  );
}

function CatalogPicker(props: {
  existing: Set<number>;
  busy: boolean;
  onCancel: () => void;
  onAdd: (catalogId: number, priceKurus: number, from: boolean) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [price, setPrice] = useState('');
  const [from, setFrom] = useState(false);

  useEffect(() => {
    api<CatalogItem[]>('/catalog')
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return catalog.filter((c) => !props.existing.has(c.id) && (!q || c.name.toLocaleLowerCase('tr').includes(q)));
  }, [catalog, query, props.existing]);

  return (
    <div className={`card ${own.panel}`}>
      <h3>Listeden hizmet ekle</h3>
      {picked ? (
        <>
          <p className={own.pickedName}>
            <strong>{picked.name}</strong> · {formatDuration(picked.duration_minutes)}
            <button type="button" className={own.link} onClick={() => setPicked(null)}>
              Değiştir
            </button>
          </p>
          <div className="field">
            <label htmlFor="cat-price">Fiyat (₺)</label>
            <input id="cat-price" className="input" inputMode="decimal" autoFocus value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <label className={own.check}>
            <input type="checkbox" checked={from} onChange={(e) => setFrom(e.target.checked)} />
            Fiyatı “ve üzeri” olarak göster
          </label>
        </>
      ) : (
        <>
          <input className="input" type="search" placeholder="Hizmet ara…" aria-label="Hizmet ara" value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul className={own.catalog} role="list">
            {shown.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setPicked(c)}>
                  <span>{c.name}</span>
                  <span>{formatDuration(c.duration_minutes)}</span>
                </button>
              </li>
            ))}
            {catalog.length > 0 && shown.length === 0 && <li className={own.emptyRow}>Bulunamadı. “Kendi hizmetiniz” ile ekleyebilirsiniz.</li>}
          </ul>
        </>
      )}
      <div className={own.panelActions}>
        <button type="button" className="btn" onClick={props.onCancel}>
          Vazgeç
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={props.busy || !picked || parseLira(price) === null}
          onClick={() => picked && props.onAdd(picked.id, parseLira(price)!, from)}
        >
          Ekle
        </button>
      </div>
    </div>
  );
}
