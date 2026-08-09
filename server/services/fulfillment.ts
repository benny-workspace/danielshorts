import { getArchetype, isArchetypeId, type ArchetypeId } from '../../shared/archetypes.js';
import { PRODUCTS, type ProductTier } from '../../shared/products.js';
import { getDb, type Order } from '../db/index.js';
import { env, log } from '../env.js';
import { signDownloadToken } from '../lib/tokens.js';
import type { BlueprintContent } from './blueprint.js';
import { sendFulfillmentEmail } from './email.js';
import { composeBlueprint } from './gemini.js';
import { renderBlueprintPdf } from './pdf.js';
import { persistFile } from './storage.js';

export interface FulfillmentResult {
  order: Order;
  downloadUrl: string;
  emailed: boolean;
  emailError?: string;
}

/** Regenerates the deliverable for an order and returns its PDF bytes. */
export async function renderOrderPdf(order: Order): Promise<Buffer> {
  const blueprint =
    order.blueprint ??
    (await composeBlueprint({
      archetype: (order.winningArchetype ?? 'best_friend') as ArchetypeId,
      answers: [],
      scoreBreakdown: {},
    }));

  const user = order.userId ? await (await getDb()).getUserById(order.userId) : null;

  return renderBlueprintPdf(blueprint, {
    name: user?.name ?? null,
    email: order.email,
    orderId: order.id,
  });
}

/**
 * Runs after a confirmed payment: writes the personalised blueprint, archives a
 * PDF copy, mints a signed download link, and emails the receipt.
 *
 * Idempotent — replayed Stripe webhooks short-circuit on an already-fulfilled
 * order instead of regenerating and re-sending.
 */
export async function fulfillOrder(params: {
  orderId: string;
  appUrl: string;
  answers?: ArchetypeId[];
  scoreBreakdown?: Record<string, number>;
  force?: boolean;
}): Promise<FulfillmentResult | null> {
  const db = await getDb();
  const order = await db.getOrder(params.orderId);
  if (!order) {
    console.error('[kdrama] fulfillment requested for unknown order', params.orderId);
    return null;
  }

  if (order.status === 'fulfilled' && order.downloadUrl && !params.force) {
    log('order already fulfilled, skipping:', order.id);
    return { order, downloadUrl: order.downloadUrl, emailed: false };
  }

  const archetypeId: ArchetypeId = isArchetypeId(order.winningArchetype)
    ? order.winningArchetype
    : 'best_friend';

  const attempt = order.quizAttemptId
    ? await db.getQuizAttempt(order.quizAttemptId)
    : null;

  const user = order.userId ? await db.getUserById(order.userId) : null;

  try {
    const blueprint: BlueprintContent = await composeBlueprint({
      archetype: archetypeId,
      answers: params.answers ?? attempt?.answers ?? [],
      scoreBreakdown: params.scoreBreakdown ?? attempt?.scoreBreakdown ?? {},
      name: user?.name ?? null,
    });

    const pdf = await renderBlueprintPdf(blueprint, {
      name: user?.name ?? null,
      email: order.email,
      orderId: order.id,
    });

    const stored = await persistFile(
      `blueprints/${order.id}.pdf`,
      pdf,
      'application/pdf',
    );

    const token = signDownloadToken(order.id, order.email);
    const downloadUrl = `${params.appUrl.replace(/\/$/, '')}/api/download/${token}`;

    const updated =
      (await db.updateOrder(order.id, {
        status: 'fulfilled',
        blueprint,
        storageKey: stored.storageKey,
        downloadUrl,
        failureReason: null,
      })) ?? order;

    if (updated.userId) await db.incrementPurchases(updated.userId);

    const product = PRODUCTS[updated.productTier as ProductTier];

    const email = await sendFulfillmentEmail({
      to: updated.email,
      name: user?.name ?? null,
      tier: updated.productTier,
      archetypeTitle: getArchetype(archetypeId).title,
      downloadUrl,
      orderId: updated.id,
      amountPaid: updated.amountPaid,
      currency: updated.currency,
      // Attach directly so the product lands even if the link is never clicked.
      pdf: product.generatesPdf ? pdf : undefined,
      templateUrl: product.deliversTemplate ? env.notionTemplateUrl || null : null,
    });

    log('fulfilled order', updated.id, 'emailed:', email.sent);

    return {
      order: updated,
      downloadUrl,
      emailed: email.sent,
      emailError: email.reason,
    };
  } catch (error) {
    const reason = (error as Error).message;
    console.error('[kdrama] fulfillment failed for', order.id, reason);
    await db.updateOrder(order.id, { status: 'failed', failureReason: reason });
    return null;
  }
}
