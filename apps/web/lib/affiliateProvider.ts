'use client';

/**
 * Architecture prep only — nothing in this file is called by any live page
 * or flow today. It exists so that when a real affiliate provider (first
 * candidate: ACCESSTRADE, once the Shopee/Lazada campaigns are approved) is
 * wired in, that work is "write a provider implementation + call
 * createOrderFromAffiliateConversion from a webhook/poll handler" instead
 * of "redesign how orders/users/cashback/wallet relate to each other." User,
 * Order, cashbackLedger, wallet and admin approval are untouched by this
 * file — it only prepares the ONE seam those systems don't have yet:
 * turning a provider's raw conversion event into a real, idempotent order.
 *
 * Nothing here calls any affiliate provider's API, creates a real tracking
 * link, or fabricates a conversion — see createOrderFromAffiliateConversion's
 * own comment for why it's safe (inert) to ship un-called.
 */

import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { notifyOrderApprovalToTelegram } from './telegram';
import { PLATFORM_LABEL, type Platform } from './orderEntry';

// Open string union (not a strict literal) so adding a second real provider
// later never requires touching every place this type is used — same
// reasoning as OrderSource in lib/orderEntry.ts.
export type AffiliateProviderId = 'ACCESSTRADE' | string;

/**
 * The shape any provider's raw webhook/poll payload must be normalized
 * into before it can become an order — this is the ONE contract every
 * future provider integration has to satisfy; nothing downstream
 * (createOrderFromAffiliateConversion, the order/ledger/wallet flow) needs
 * to know anything provider-specific beyond this shape.
 */
export type AffiliateConversion = {
  provider: AffiliateProviderId;
  // The provider's own unique id for this conversion event — the PRIMARY
  // idempotency key (see createOrderFromAffiliateConversion). Two webhook
  // deliveries, a polling re-fetch, or a manual retry for the same
  // conversion must carry the same conversionId.
  conversionId: string;
  // The provider's own order id, when it has one distinct from
  // conversionId — used as the FALLBACK idempotency key only if
  // conversionId is ever unavailable for some provider.
  externalOrderId?: string;
  // The tracking code our own side generated (redirectCache/{code}, see
  // lib/redirectLink.ts) — this is how a conversion maps back to a userId.
  // NOT the same thing as af_sub_id/sub_id/aff_sub showing up unconfirmed
  // in our own outgoing URL; this field is only ever trusted here once a
  // real provider payload has echoed it back as data THEY captured on a
  // real click/purchase.
  subId: string;
  platform: Platform;
  productName: string;
  orderValue: number;
  commissionAmount: number;
  commissionStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  rawPayload?: unknown;
};

/**
 * What a concrete provider module (e.g. a future lib/providers/accessTrade.ts)
 * must implement. Deliberately minimal: this app has no server, so a
 * provider's webhook receiver lives in a Cloudflare Worker (mirroring
 * workers/telegram-bot's existing isPaymentBot()-signed-in-via-REST
 * pattern) — buildTrackingLink and normalizeConversion are the two pieces
 * of provider-specific logic that Worker would need, kept here as a typed
 * contract so the Worker-side implementation (plain JS, no this module's
 * imports available to it, same constraint documented in
 * workers/telegram-bot/src/index.js) has an exact shape to match.
 */
export interface AffiliateProvider {
  id: AffiliateProviderId;
  /** Turns our own tracking code + the raw destination URL into whatever
   * deep-link format the provider's real affiliate system requires. */
  buildTrackingLink(input: { subId: string; destinationUrl: string }): string;
  /** Turns the provider's raw webhook/poll payload into our normalized
   * shape, or null if the payload isn't a conversion this app cares about. */
  normalizeConversion(rawPayload: unknown): AffiliateConversion | null;
}

/**
 * subId IS the redirectCache doc's own id (see lib/redirectLink.ts —
 * createOrReuseRedirect already tags every outgoing link with this code as
 * af_sub_id/sub_id/aff_sub). A real provider conversion payload echoing
 * this same code back is what turns "an internal tracking tag we hoped
 * would come back" into a confirmed mapping to a real userId. Returns null
 * if the code doesn't exist or was never created for anyone (never guesses).
 */
export async function resolveUserIdFromSubId(subId: string): Promise<string | null> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'redirectCache', subId));
  if (!snap.exists()) return null;
  return (snap.data().userId as string | undefined) ?? null;
}

function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} ₫`;
}

/**
 * The idempotent entry point a future webhook/poll handler calls once per
 * received conversion. NOT called by anything today — no real provider is
 * wired in yet, and this must never be invoked with synthetic/fabricated
 * conversion data (that would create a real PENDING order + admin
 * notification for money that doesn't exist).
 *
 * Idempotency: the Firestore document id is deterministic —
 * `${provider}_${conversionId}` (falling back to
 * `${provider}_ext_${externalOrderId}` only if the provider has no
 * conversionId for some payload). Handles every duplicate-delivery
 * scenario the SAME way, by construction, with no separate dedup table:
 *   - webhook redelivery / retry: identical id -> same document -> the
 *     transaction below sees it already exists and returns created:false.
 *   - polling re-fetching an already-seen conversion: identical id, same
 *     outcome.
 *   - two concurrent calls for the same conversion (a retry racing the
 *     original, or two Worker instances): the transaction serializes on
 *     that one document id — whichever commits first wins, the other's
 *     tx.get() sees it already exists and returns created:false. Never two
 *     orders for one conversion, regardless of timing.
 * This is the same pattern confirmOrderWithLedger (lib/orderEntry.ts) uses
 * for the CONFIRMED-transition race — a transaction guarding a single,
 * deterministic document.
 */
export async function createOrderFromAffiliateConversion(
  conversion: AffiliateConversion,
): Promise<{ orderId: string; created: boolean }> {
  const db = getFirebaseDb();
  const orderId = conversion.conversionId
    ? `${conversion.provider}_${conversion.conversionId}`
    : `${conversion.provider}_ext_${conversion.externalOrderId}`;
  const orderRef = doc(db, 'orders', orderId);

  const userId = await resolveUserIdFromSubId(conversion.subId);
  if (!userId) {
    // No known link created this subId — nothing to attribute the order
    // to. A real integration should log/alert on this rather than silently
    // drop it; left as a thrown error so the caller (a Worker) decides how
    // to surface it (e.g. a Telegram alert to an "unmatched conversions"
    // topic), matching this app's existing best-effort Telegram patterns.
    throw new Error(`createOrderFromAffiliateConversion: no user found for subId ${conversion.subId}`);
  }

  const orderFields = {
    userId,
    platform: conversion.platform,
    productName: conversion.productName,
    productUrl: null,
    imageUrl: null,
    orderValue: conversion.orderValue,
    commissionAmount: conversion.commissionAmount,
    status: 'PENDING' as const,
    orderDate: serverTimestamp(),
    confirmedAt: null,
    source: 'AFFILIATE' as const,
    externalOrderId: conversion.externalOrderId ?? null,
    subId: conversion.subId,
    trackingId: conversion.subId,
    affiliateProvider: conversion.provider,
    affiliateConversionId: conversion.conversionId,
    commissionStatus: conversion.commissionStatus,
    telegramChatId: null,
    telegramMessageId: null,
  };

  const created = await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (snap.exists()) return false;
    tx.set(orderRef, orderFields);
    return true;
  });

  if (created) {
    // Same admin notification hook every manually-entered PENDING order
    // gets (see upsertOrder in lib/orderEntry.ts) — kept identical so
    // wiring a real provider in later needs no changes to how admin finds
    // out about a new order, only to how the order itself gets created.
    const customerSnap = await getDoc(doc(db, 'users', userId));
    const customerData = customerSnap.exists() ? customerSnap.data() : null;
    const telegramRef = await notifyOrderApprovalToTelegram({
      requesterName: customerData?.fullName || customerData?.email || userId,
      requesterEmail: customerData?.email || '—',
      productName: conversion.productName,
      platformLabel: PLATFORM_LABEL[conversion.platform] ?? conversion.platform,
      orderValue: conversion.orderValue,
      orderValueLabel: formatVnd(conversion.orderValue),
      commissionAmount: conversion.commissionAmount,
      commissionAmountLabel: formatVnd(conversion.commissionAmount),
      orderId,
    });
    if (telegramRef) {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(orderRef);
        if (!snap.exists()) return;
        tx.update(orderRef, { telegramChatId: telegramRef.chatId, telegramMessageId: telegramRef.messageId });
      });
    }
  }

  return { orderId, created };
}
