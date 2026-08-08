import { capabilities, env, log } from '../env.js';
import { formatPrice, PRODUCTS, type ProductTier } from '../../shared/products.js';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}

export interface SendResult {
  sent: boolean;
  reason?: string;
  id?: string;
}

async function send(args: SendArgs): Promise<SendResult> {
  if (!capabilities.email) {
    log('email skipped (no RESEND_API_KEY):', args.subject, '->', args.to);
    return { sent: false, reason: 'RESEND_API_KEY not configured' };
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(env.resendApiKey);
    const { data, error } = await resend.emails.send({
      from: env.mailFrom,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      ...(env.mailReplyTo ? { replyTo: env.mailReplyTo } : {}),
      ...(args.attachments?.length
        ? {
            attachments: args.attachments.map((a) => ({
              filename: a.filename,
              content: a.content.toString('base64'),
            })),
          }
        : {}),
    });

    if (error) {
      console.error('[kdrama] resend error:', error.message);
      return { sent: false, reason: error.message };
    }
    return { sent: true, id: data?.id };
  } catch (error) {
    console.error('[kdrama] email send failed:', (error as Error).message);
    return { sent: false, reason: (error as Error).message };
  }
}

const SHELL = (title: string, body: string, footerNote?: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#14121a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#14121a;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fbf8f3;border-radius:14px;overflow:hidden;font-family:Georgia,'Times New Roman',serif;">
        <tr><td style="padding:28px 34px 0;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:3px;color:#a8873f;font-weight:700;">K-DRAMA DREAMS</div>
        </td></tr>
        <tr><td style="padding:18px 34px 34px;color:#14121a;font-size:16px;line-height:1.65;">
          ${body}
        </td></tr>
        <tr><td style="padding:18px 34px 30px;border-top:1px solid #e4ddd3;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#6b6472;">
            ${footerNote ?? 'Crafted for entertainment and creative self-reflection.'}
            <br>Questions? Just reply to this email.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#c33c56;color:#fbf8f3;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;padding:14px 26px;border-radius:8px;">${label}</a>`;

export function sendFulfillmentEmail(params: {
  to: string;
  name?: string | null;
  tier: ProductTier;
  archetypeTitle: string;
  downloadUrl: string;
  orderId: string;
  amountPaid: number;
  currency: string;
  pdf?: Buffer;
}): Promise<SendResult> {
  const product = PRODUCTS[params.tier];
  const greeting = params.name?.trim() ? `${params.name.trim()},` : 'Hello,';
  const price = formatPrice(params.amountPaid, params.currency);

  const body = `
    <p style="margin:0 0 18px;">${greeting}</p>
    <p style="margin:0 0 18px;">Your <strong>${product.name}</strong> is ready. It was written around the exact answers you gave, for <em>${params.archetypeTitle}</em>.</p>
    <p style="margin:0 0 26px;">${button(params.downloadUrl, 'Download your blueprint')}</p>
    <p style="margin:0 0 22px;font-size:13px;color:#6b6472;font-family:Helvetica,Arial,sans-serif;">
      This link is signed and expires in ${env.downloadTtlHours} hours. Save the PDF once you open it.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4ddd3;margin-top:8px;">
      <tr><td style="padding-top:16px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#6b6472;">
        <div style="letter-spacing:2px;font-weight:700;color:#a8873f;font-size:10px;margin-bottom:8px;">ORDER RECEIPT</div>
        <div>Order&nbsp;&nbsp;<strong style="color:#14121a;">${params.orderId.slice(0, 8).toUpperCase()}</strong></div>
        <div>Item&nbsp;&nbsp;<strong style="color:#14121a;">${product.headline}</strong></div>
        <div>Paid&nbsp;&nbsp;<strong style="color:#14121a;">${price}</strong></div>
      </td></tr>
    </table>`;

  const text = `${greeting}

Your ${product.name} is ready — written around your exact quiz answers for ${params.archetypeTitle}.

Download: ${params.downloadUrl}
(This signed link expires in ${env.downloadTtlHours} hours.)

Order ${params.orderId.slice(0, 8).toUpperCase()} · ${product.headline} · ${price}

— K-Drama Dreams`;

  return send({
    to: params.to,
    subject: `Your ${product.name} is ready`,
    html: SHELL('Your blueprint is ready', body),
    text,
    attachments: params.pdf
      ? [{ filename: 'romantic-blueprint.pdf', content: params.pdf }]
      : undefined,
  });
}

export function sendMagicLinkEmail(params: {
  to: string;
  url: string;
}): Promise<SendResult> {
  const body = `
    <p style="margin:0 0 18px;">Here is your sign-in link.</p>
    <p style="margin:0 0 24px;">${button(params.url, 'Sign in to your library')}</p>
    <p style="margin:0;font-size:13px;color:#6b6472;font-family:Helvetica,Arial,sans-serif;">
      The link works once and expires in 20 minutes. If you did not request it, you can ignore this email.
    </p>`;

  return send({
    to: params.to,
    subject: 'Your K-Drama Dreams sign-in link',
    html: SHELL('Sign in', body, 'You are receiving this because someone entered this address on our site.'),
    text: `Sign in to K-Drama Dreams: ${params.url}\n\nThe link expires in 20 minutes.`,
  });
}

export function sendResultEmail(params: {
  to: string;
  archetypeTitle: string;
  hook: string;
  resultUrl: string;
}): Promise<SendResult> {
  const body = `
    <p style="margin:0 0 10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;color:#c33c56;font-weight:700;">YOUR ARCHETYPE</p>
    <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#14121a;font-weight:normal;">${params.archetypeTitle}</h1>
    <p style="margin:0 0 24px;font-style:italic;color:#6b6472;">${params.hook}</p>
    <p style="margin:0 0 24px;">${button(params.resultUrl, 'Replay your dream scene')}</p>`;

  return send({
    to: params.to,
    subject: `You are ${params.archetypeTitle}`,
    html: SHELL('Your archetype', body),
    text: `Your archetype: ${params.archetypeTitle}\n${params.hook}\n\n${params.resultUrl}`,
  });
}
