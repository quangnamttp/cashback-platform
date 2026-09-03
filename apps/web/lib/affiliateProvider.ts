'use client';

/**
 * ARCHITECTURE PREP ONLY — nothing in this file is called by any live page
 * or flow today (see createOrderFromAffiliateConversion's own comment for
 * why it's safe to ship un-called). It exists so that wiring in a real
 * affiliate provider later (first candidate: ACCESSTRADE, once Shopee/
 * Lazada campaigns are approved) is "write a provider implementation +
 * call the Worker-side equivalent of createOrderFromAffiliateConversion
 * from a webhook/poll handler" instead of "redesign how orders/users/
 * cashback/wallet relate to each other." User, Order, cashbackLedger,
 * wallet and admin approval are untouched by this file.
 *
 * ⚠️ WEB-ONLY — DO NOT IMPORT THIS FILE FROM A CLOUDFLARE WORKER.
 * This is a 'use client' module: it pulls in the Firebase JS (client) SDK
 * via getFirebaseDb()/lib/firebase.ts and lib/telegram.ts, both of which
 * assume a browser environment and are bundled by Next.js, not usable from
 * a standalone Worker script. This is the SAME constraint
 * workers/telegram-bot/src/index.js already documents at its own top ("no
 * access to that module, and no Firebase client SDK, only the raw REST
 * API") — a Worker has no shared build with apps/web at all, so nothing
 * under apps/web/lib/ can ever be literally imported by one, regardless of
 * whether it's marked 'use client'.
 *
 * WHERE EACH RESPONSIBILITY LIVES (the boundary a real integration must
 * respect):
 *
 *   WEB / apps/web (this file + lib/redirectLink.ts) owns:
 *     - creating tracking links (createOrReuseRedirect in lib/redirectLink.ts)
 *     - mapping a tracking code back to a user (resolveUserIdFromSubId below
 *       — a plain read, safe and genuinely useful from the browser, e.g. a
 *       future admin page manually inspecting an unmatched conversion)
 *     - the AffiliateProvider/AffiliateConversion contract types below, so
 *       a Worker implementation has an exact, TypeScript-checked shape to
 *       match even though it can't import this file directly
 *
 *   WORKER / a future workers/<provider>-webhook (NOT written yet — Shopee
 *   and Lazada aren't approved, nothing should call a real provider API
 *   until they are) must own, in plain JS + Firestore REST + its own
 *   narrowly-scoped Firebase Auth identity (mirroring workers/telegram-bot's
 *   isPaymentBot() pattern — a new identity, not that same one, since this
 *   Worker needs different permissions: orders/create for AFFILIATE-sourced
 *   orders, which isPaymentBot() deliberately does NOT have today):
 *     - receiving the webhook or running the poll
 *     - normalizing the raw payload into the AffiliateConversion shape
 *     - the idempotency check (see createOrderFromAffiliateConversion's
 *       comment below for the exact algorithm to replicate)
 *     - resolving conversion -> user (REST GET on redirectCache/{subId},
 *       same lookup resolveUserIdFromSubId does, reimplemented over REST)
 *     - creating/updating the Order document
 *     - storing commission amount/status
 *     - sending the admin Telegram notification
 *   createOrderFromAffiliateConversion below is the REFERENCE
 *   implementation of all of that — correct, typed, and runnable against a
 *   real Firebase project during development — but it is not what actually
 *   runs in production; the Worker's REST version is the one real webhook
 *   traffic hits, replicated line-for-line from this one when that Worker
 *   is written.
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
  // conversion must carry the same conversionId. A provider typically
  // sends MULTIPLE events for the same conversionId over its lifetime
  // (e.g. commissionStatus PENDING at click/purchase time, then APPROVED
  // or REJECTED once they finish their own review) — createOrderFromAffiliate
  // Conversion below handles both "never seen this id" (create) and
  // "seen it, status changed" (update) from the exact same call.
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
 * What a concrete provider module (e.g. a future lib/providers/accessTrade.ts
 * on the web side, mirrored in REST form inside the Worker) must implement.
 * Deliberately minimal — buildTrackingLink and normalizeConversion are the
 * two pieces of provider-specific logic everything else in this file is
 * written to never need to know about.
 */
export interface AffiliateProvider {
  id: AffiliateProviderId;
  /** Turns our own tracking code + the raw destination URL into whatever
   * deep-link format the provider's real affiliate system requires. See
   * lib/redirectLink.ts's buildAffiliateUrl — the web-side function this
   * interface method will eventually replace the body of, once a real
   * provider is approved and its own deep-link rules are known. */
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
 * received conversion event. NOT called by anything today — no real
 * provider is wired in yet, and this must never be invoked with synthetic/
 * fabricated conversion data (that would create a real PENDING order +
 * admin notification for money that doesn't exist).
 *
 * Idempotency — the Firestore document id is deterministic:
 * `${provider}_${conversionId}` (falling back to
 * `${provider}_ext_${externalOrderId}` only if the provider has no
 * conversionId for some payload). One transaction handles BOTH cases a
 * real provider integration needs, by construction, with no separate dedup
 * table:
 *   - conversionId never seen before -> creates a new PENDING order.
 *   - conversionId already seen (webhook redelivery, polling re-fetch, a
 *     retry, OR a genuine later lifecycle event like PENDING->APPROVED) ->
 *     no new order; if the order is STILL PENDING (admin hasn't acted on
 *     it yet) and the incoming commissionStatus/commissionAmount differ
 *     from what's stored, updates just those two fields in place. Once the
 *     admin has moved the order past PENDING (CONFIRMED/CANCELLED/
 *     REFUNDED), the order's commission figures are already locked into
 *     real ledger entries and are never silently rewritten by a later
 *     provider event — that mismatch would need a human to notice, same
 *     philosophy as the existing REFUNDED-after-RELEASE fraud-signal
 *     safety net in lib/orderEntry.ts's upsertOrder.
 *   - two concurrent calls for the same conversion (a retry racing the
 *     original, two Worker instances, or a create racing an update): the
 *     transaction serializes on that one document id — whichever commits
 *     first wins, the other's tx.get() sees the committed result and
 *     either backs off (already created) or reads the just-updated value
 *     (already updated). Never two orders for one conversion, and never a
 *     lost/overwritten status update, regardless of timing.
 * This is the same pattern confirmOrderWithLedger (lib/orderEntry.ts) uses
 * for the CONFIRMED-transition race — a transaction guarding a single,
 * deterministic document.
 */
export async function createOrderFromAffiliateConversion(
  conversion: AffiliateConversion,
): Promise<{ orderId: string; created: boolean; updated: boolean }> {
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

  const newOrderFields = {
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

  const { created, updated } = await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) {
      tx.set(orderRef, newOrderFields);
      return { created: true, updated: false };
    }
    const existing = snap.data();
    if (existing.status !== 'PENDING') {
      // Admin already acted on this order — a later provider event must
      // never silently change commission figures underneath an already-
      // settled decision.
      return { created: false, updated: false };
    }
    const statusChanged = existing.commissionStatus !== conversion.commissionStatus;
    const amountChanged = existing.commissionAmount !== conversion.commissionAmount;
    if (!statusChanged && !amountChanged) {
      return { created: false, updated: false };
    }
    tx.update(orderRef, {
      commissionStatus: conversion.commissionStatus,
      commissionAmount: conversion.commissionAmount,
    });
    return { created: false, updated: true };
  });

  if (created) {
    // Same admin notification hook every manually-entered PENDING order
    // gets (see upsertOrder in lib/orderEntry.ts) — kept identical so
    // wiring a real provider in later needs no changes to how admin finds
    // out about a new order, only to how the order itself gets created.
    // Deliberately NOT re-sent on an updated (not created) order — a later
    // commissionStatus/commissionAmount change edits the SAME still-PENDING
    // order the admin was already notified about once; a second Telegram
    // message per lifecycle event would be spammy, not useful, and admin
    // still sees the current values whenever they open /manager/orders.
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

  return { orderId, created, updated };
}
