import type { Deps } from '../deps.js';
import type { Queryable } from '../db.js';
import { badRequest, conflict } from '../errors.js';
import { currentVersion, LEGAL_DOCUMENTS, requiredFor } from '../domain/legal.js';
import type { User } from './auth.js';

export type ConsentInput = { key: string; version: string };

/**
 * Records acceptance as evidence: which document, which version, when. Only the
 * current version can be accepted, so the record matches the text that was shown.
 */
export async function recordConsents(
  q: Queryable,
  userId: string,
  items: ConsentInput[],
  now: Date,
  shopId: string | null = null,
) {
  for (const item of items) {
    const version = currentVersion(item.key);
    if (!version) throw badRequest('UNKNOWN_DOCUMENT', `Unknown document ${item.key}`);
    if (version !== item.version) throw conflict('OUTDATED_DOCUMENT', 'The agreement was updated; please review it again');
    await q.query(
      `INSERT INTO consents (user_id, shop_id, document_key, version, accepted_at)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (SELECT 1 FROM consents WHERE user_id = $1 AND document_key = $3 AND version = $4
                         AND shop_id IS NOT DISTINCT FROM $2 AND withdrawn_at IS NULL)`,
      [userId, shopId, item.key, version, now],
    );
  }
}

/** Throws unless every document required for this audience is among the items. */
export function assertIncludesRequired(items: ConsentInput[], audience: 'customer' | 'business') {
  const missing = requiredFor(audience).filter((key) => !items.some((i) => i.key === key));
  if (missing.length) throw badRequest('CONSENT_REQUIRED', `Accept: ${missing.join(', ')}`);
}

export async function hasAccepted(q: Queryable, userId: string, key: string): Promise<boolean> {
  const { rowCount } = await q.query(
    'SELECT 1 FROM consents WHERE user_id = $1 AND document_key = $2 AND withdrawn_at IS NULL LIMIT 1',
    [userId, key],
  );
  return Boolean(rowCount);
}

export async function listConsents(deps: Deps, user: User) {
  const { rows } = await deps.db.query(
    `SELECT document_key, version, accepted_at, withdrawn_at, shop_id FROM consents
     WHERE user_id = $1 ORDER BY accepted_at DESC`,
    [user.id],
  );
  return rows;
}

/** Optional consents (marketing messages) can be withdrawn at any time. */
export async function withdrawConsent(deps: Deps, user: User, key: string) {
  const doc = LEGAL_DOCUMENTS.find((d) => d.key === key);
  if (!doc || doc.audience !== 'optional') throw badRequest('NOT_WITHDRAWABLE', 'Only optional consents can be withdrawn');
  await deps.db.query(
    'UPDATE consents SET withdrawn_at = $3 WHERE user_id = $1 AND document_key = $2 AND withdrawn_at IS NULL',
    [user.id, key, deps.clock.now()],
  );
}
