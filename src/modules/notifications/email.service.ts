import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Email service using Zoho Mail REST API (OAuth 2.0).
 * Falls back to console logging when credentials are not set.
 *
 * Required env vars:
 *   ZOHO_MAIL_ACCOUNT_ID
 *   ZOHO_MAIL_CLIENT_ID
 *   ZOHO_MAIL_CLIENT_SECRET
 *   ZOHO_MAIL_REFRESH_TOKEN
 *   ZOHO_MAIL_REGION  (com | eu | in | com.au | jp)
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly accountId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly refreshToken: string;
  private readonly region: string;
  private readonly fromAddress: string;
  private readonly isConfigured: boolean;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  private readonly logoUrl: string;

  constructor() {
    this.accountId = process.env['ZOHO_MAIL_ACCOUNT_ID'] ?? '';
    this.clientId = process.env['ZOHO_MAIL_CLIENT_ID'] ?? '';
    this.clientSecret = process.env['ZOHO_MAIL_CLIENT_SECRET'] ?? '';
    this.refreshToken = process.env['ZOHO_MAIL_REFRESH_TOKEN'] ?? '';
    this.region = process.env['ZOHO_MAIL_REGION'] ?? 'com';
    this.fromAddress = process.env['SMTP_FROM'] ?? 'noreply@martinonoir.com';
    this.logoUrl = `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/images/martino_logo.png`;

    this.isConfigured = !!(this.accountId && this.clientId && this.clientSecret && this.refreshToken);
    if (this.isConfigured) {
      this.logger.log(`Zoho Mail API configured: accountId=${this.accountId}, region=${this.region}`);
    } else {
      this.logger.warn('Zoho Mail API credentials not set — emails will be logged to console');
    }
  }

  // ── OAuth Token Management ──

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }
    const body = `refresh_token=${encodeURIComponent(this.refreshToken)}&client_id=${encodeURIComponent(this.clientId)}&client_secret=${encodeURIComponent(this.clientSecret)}&grant_type=refresh_token`;

    const data = await this.httpsRequest({
      hostname: `accounts.zoho.${this.region}`,
      path: '/oauth/v2/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, body);

    const parsed = JSON.parse(data);
    if (!parsed.access_token) {
      throw new Error(`Zoho token refresh failed: ${JSON.stringify(parsed)}`);
    }
    this.accessToken = parsed.access_token;
    this.tokenExpiresAt = Date.now() + ((parsed.expires_in ?? 3600) * 1000);
    this.logger.log('Zoho access token refreshed');
    return this.accessToken!;
  }

  // ── Core Send ──

  async send(input: SendEmailInput): Promise<EmailResult> {
    const recipients = Array.isArray(input.to) ? input.to.join(', ') : input.to;

    if (!this.isConfigured) {
      this.logger.log(`[DEV EMAIL] To: ${recipients} | Subject: ${input.subject}\n${input.html.replace(/<[^>]*>/g, '').slice(0, 300)}`);
      return { success: true, messageId: `dev-${Date.now()}` };
    }

    try {
      const token = await this.getAccessToken();
      const payload = JSON.stringify({
        fromAddress: input.from ?? this.fromAddress,
        toAddress: recipients,
        subject: input.subject,
        content: input.html,
        askReceipt: 'no',
      });

      const data = await this.httpsRequest({
        hostname: `mail.zoho.${this.region}`,
        path: `/api/accounts/${this.accountId}/messages`,
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, payload);

      const parsed = JSON.parse(data);
      if (parsed.status?.code === 200) {
        this.logger.log(`Email sent to ${recipients}: ${parsed.data?.messageId ?? 'ok'}`);
        return { success: true, messageId: parsed.data?.messageId };
      }
      this.logger.error(`Zoho API error: ${JSON.stringify(parsed)}`);
      return { success: false, error: parsed.status?.description ?? 'Unknown error' };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send email to ${recipients}: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  // ── HTTPS Helper ──

  private httpsRequest(options: https.RequestOptions, body?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
      if (body) req.write(body);
      req.end();
    });
  }

  // ── Branded Layout ──

  private brandedLayout(content: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Martino Noir</title></head>
<body style="margin:0;padding:0;background:#f6f9fd;font-family:'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f9fd;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">
<!-- Header -->
<tr><td style="background:#0a0a0a;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;">
<img src="${this.logoUrl}" alt="Martino Noir" width="140" height="auto" style="display:block;margin:0 auto;max-width:140px;filter:invert(1);"/>
</td></tr>
<!-- Content -->
<tr><td style="background:#ffffff;padding:32px;border-left:1px solid #e4e7eb;border-right:1px solid #e4e7eb;">
${content}
</td></tr>
<!-- Footer -->
<tr><td style="background:#0a0a0a;padding:24px 32px;border-radius:0 0 12px 12px;text-align:center;">
<p style="margin:0 0 8px 0;color:#9AA5B1;font-size:12px;">Martino Noir — Luxury Bags, Clothing & Accessories</p>
<p style="margin:0;color:#5A6775;font-size:11px;">
<a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}" style="color:#4A90E2;text-decoration:none;">Website</a> &nbsp;|&nbsp;
<a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/shop" style="color:#4A90E2;text-decoration:none;">Shop</a> &nbsp;|&nbsp;
<a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/contact" style="color:#4A90E2;text-decoration:none;">Contact</a>
</p>
<p style="margin:8px 0 0;color:#3B4754;font-size:10px;">&copy; ${new Date().getFullYear()} Martino Noir. All rights reserved.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  }

  // ── Template: Order Confirmation ──

  async sendOrderConfirmation(
    to: string,
    orderNumber: string,
    grandTotal: number,
    currency: string,
    items?: Array<{ name: string; variant: string; quantity: number; price: number }>,
  ): Promise<EmailResult> {
    const formatted = currency === 'NGN' ? `₦${grandTotal.toLocaleString()}` : `$${grandTotal.toFixed(2)}`;
    const itemsHtml = items?.length
      ? `<table width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;border-collapse:collapse;">
          <tr style="background:#f6f9fd;">
            <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#3B4754;border-bottom:1px solid #e4e7eb;">Item</td>
            <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#3B4754;border-bottom:1px solid #e4e7eb;" align="center">Qty</td>
            <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#3B4754;border-bottom:1px solid #e4e7eb;" align="right">Price</td>
          </tr>
          ${items.map(i => `<tr>
            <td style="padding:10px 12px;font-size:13px;color:#1F2933;border-bottom:1px solid #f0f0f0;">
              <strong>${i.name}</strong><br/><span style="color:#7B8794;font-size:11px;">${i.variant}</span>
            </td>
            <td style="padding:10px 12px;font-size:13px;color:#1F2933;border-bottom:1px solid #f0f0f0;" align="center">${i.quantity}</td>
            <td style="padding:10px 12px;font-size:13px;color:#1F2933;border-bottom:1px solid #f0f0f0;" align="right">${currency === 'NGN' ? '₦' : '$'}${i.price.toLocaleString()}</td>
          </tr>`).join('')}
        </table>` : '';

    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;background:#E6F4EC;border-radius:50%;margin:0 auto 16px;line-height:56px;font-size:28px;">✓</div>
        <h1 style="margin:0;font-size:24px;color:#0a0a0a;">Order Confirmed!</h1>
        <p style="margin:8px 0 0;color:#5A6775;font-size:14px;">Thank you for shopping with Martino Noir</p>
      </div>
      <div style="background:#f6f9fd;border-radius:8px;padding:16px 20px;margin:24px 0;text-align:center;">
        <p style="margin:0;font-size:12px;color:#7B8794;">Order Number</p>
        <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#0a0a0a;font-family:monospace;">${orderNumber}</p>
      </div>
      ${itemsHtml}
      <div style="background:#0B3D91;border-radius:8px;padding:16px 20px;text-align:center;margin:24px 0;">
        <p style="margin:0;color:rgba(255,255,255,0.7);font-size:12px;">Total</p>
        <p style="margin:4px 0 0;font-size:28px;font-weight:700;color:#fff;">${formatted}</p>
      </div>
      <p style="color:#5A6775;font-size:13px;line-height:1.6;">
        We're preparing your order for shipment. You'll receive another email with tracking information once it ships.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/account" style="display:inline-block;background:#0a0a0a;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View My Orders</a>
      </div>`;

    return this.send({ to, subject: `Order Confirmed — ${orderNumber}`, html: this.brandedLayout(content) });
  }

  // ── Template: Shipping Notification ──

  async sendShippingNotification(
    to: string,
    orderNumber: string,
    trackingNumber?: string,
    carrier?: string,
    estimatedDays?: { min: number; max: number },
  ): Promise<EmailResult> {
    const trackingHtml = trackingNumber
      ? `<div style="background:#f6f9fd;border-radius:8px;padding:16px 20px;margin:24px 0;">
          <p style="margin:0;font-size:12px;color:#7B8794;">Tracking Number</p>
          <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#0a0a0a;font-family:monospace;">${trackingNumber}</p>
          ${carrier ? `<p style="margin:4px 0 0;font-size:12px;color:#5A6775;">Carrier: ${carrier}</p>` : ''}
          ${estimatedDays ? `<p style="margin:4px 0 0;font-size:12px;color:#5A6775;">Estimated delivery: ${estimatedDays.min}–${estimatedDays.max} business days</p>` : ''}
        </div>` : '';

    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;background:#E6F4EC;border-radius:50%;margin:0 auto 16px;line-height:56px;font-size:28px;">📦</div>
        <h1 style="margin:0;font-size:24px;color:#0a0a0a;">Your Order Has Shipped!</h1>
        <p style="margin:8px 0 0;color:#5A6775;">Order <strong>${orderNumber}</strong> is on its way</p>
      </div>
      ${trackingHtml}
      <p style="color:#5A6775;font-size:13px;line-height:1.6;">
        Your order has been carefully packed and handed to the courier. You can track your shipment using the tracking number above.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/track-order" style="display:inline-block;background:#0a0a0a;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Track Order</a>
      </div>`;

    return this.send({ to, subject: `Your Order ${orderNumber} Has Shipped! 📦`, html: this.brandedLayout(content) });
  }

  // ── Template: Order Delivered ──

  async sendOrderDelivered(
    to: string,
    orderNumber: string,
  ): Promise<EmailResult> {
    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;background:#E6F4EC;border-radius:50%;margin:0 auto 16px;line-height:56px;font-size:28px;">✅</div>
        <h1 style="margin:0;font-size:24px;color:#0a0a0a;">Your Order Has Been Delivered!</h1>
        <p style="margin:8px 0 0;color:#5A6775;">Order <strong>${orderNumber}</strong> has arrived</p>
      </div>
      <p style="color:#5A6775;font-size:13px;line-height:1.6;">
        Thank you for shopping with Martino Noir. We hope you love your purchase. If anything isn't right, you can request a return within 30 days from your account.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/account" style="display:inline-block;background:#0a0a0a;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View My Orders</a>
      </div>`;

    return this.send({
      to,
      subject: `Order ${orderNumber} Delivered — Thank you! ✨`,
      html: this.brandedLayout(content),
    });
  }

  // ── Template: Password Reset ──

  /**
   * `resetPath` selects which portal the link lands on: customers reset at
   * /reset-password, marketing agents at /agent/reset-password. The token
   * itself is portal-agnostic, but the endpoint that redeems it enforces the
   * account's role, so a link can only be used in the portal it was issued for.
   */
  async sendPasswordReset(
    to: string,
    resetToken: string,
    expiresInMinutes: number,
    resetPath: string = '/reset-password',
    portalLabel: string = 'Martino Noir account',
  ): Promise<EmailResult> {
    const resetUrl = `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}${resetPath}?token=${resetToken}`;
    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;background:#EEF4FC;border-radius:50%;margin:0 auto 16px;line-height:56px;font-size:28px;">🔐</div>
        <h1 style="margin:0;font-size:24px;color:#0a0a0a;">Reset Your Password</h1>
      </div>
      <p style="color:#1F2933;font-size:14px;line-height:1.6;">
        You requested a password reset for your ${portalLabel}. Click the button below to set a new password:
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#0B3D91;color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Reset Password</a>
      </div>
      <p style="color:#7B8794;font-size:12px;line-height:1.5;">
        This link expires in <strong>${expiresInMinutes} minutes</strong>. If you didn't request a password reset, you can safely ignore this email.
      </p>
      <div style="background:#FEF3F2;border-radius:8px;padding:12px 16px;margin-top:24px;">
        <p style="margin:0;color:#B42318;font-size:12px;">⚠️ Never share this link with anyone. Martino Noir support will never ask for your password.</p>
      </div>`;

    return this.send({ to, subject: 'Reset Your Password — Martino Noir', html: this.brandedLayout(content) });
  }

  // ── Template: Welcome ──

  async sendWelcome(to: string, firstName: string): Promise<EmailResult> {
    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;background:#EEF4FC;border-radius:50%;margin:0 auto 16px;line-height:56px;font-size:28px;">👋</div>
        <h1 style="margin:0;font-size:24px;color:#0a0a0a;">Welcome, ${firstName}!</h1>
        <p style="margin:8px 0 0;color:#5A6775;font-size:14px;">Thank you for joining Martino Noir</p>
      </div>
      <p style="color:#1F2933;font-size:14px;line-height:1.6;">
        You now have access to our exclusive collection of luxury bags, clothing, and accessories. Here's what you can do:
      </p>
      <ul style="color:#1F2933;font-size:13px;line-height:2;padding-left:20px;">
        <li>Browse our curated collection</li>
        <li>Save items to your wishlist</li>
        <li>Enjoy complimentary shipping on orders over ₦150,000</li>
        <li>Track your orders in real-time</li>
      </ul>
      <div style="text-align:center;margin:32px 0;">
        <a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/shop" style="display:inline-block;background:#0a0a0a;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Start Shopping</a>
      </div>`;

    return this.send({ to, subject: 'Welcome to Martino Noir ✨', html: this.brandedLayout(content) });
  }

  // ── Template: Low Stock Alert (Admin) ──

  async sendLowStockAlert(to: string, sku: string, variantName: string, currentStock: number): Promise<EmailResult> {
    const content = `
      <div style="background:#FEF3F2;border:1px solid #FECDC9;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <h2 style="margin:0 0 8px 0;font-size:18px;color:#B42318;">⚠️ Low Stock Alert</h2>
        <p style="margin:0;font-size:14px;color:#7A271A;">
          <strong>${variantName}</strong> (SKU: ${sku}) has only <strong>${currentStock} units</strong> remaining.
        </p>
      </div>
      <p style="color:#1F2933;font-size:14px;">Please restock this item soon to avoid stockouts and lost sales.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${process.env['ADMIN_URL'] ?? 'http://localhost:3003'}/inventory" style="display:inline-block;background:#B42318;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Manage Inventory</a>
      </div>`;

    return this.send({ to, subject: `⚠️ Low Stock: ${variantName} (${sku}) — ${currentStock} left`, html: this.brandedLayout(content) });
  }

  // ── Template: Email Verification ──

  async sendEmailVerification(to: string, firstName: string, verificationToken: string, expiresInHours = 24): Promise<EmailResult> {
    const verifyUrl = `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;background:#E6F4EC;border-radius:50%;margin:0 auto 16px;line-height:56px;font-size:28px;">✉️</div>
        <h1 style="margin:0;font-size:24px;color:#0a0a0a;">Verify Your Email</h1>
        <p style="margin:8px 0 0;color:#5A6775;font-size:14px;">Hi ${firstName}, please confirm your email address</p>
      </div>
      <p style="color:#1F2933;font-size:14px;line-height:1.6;">
        Click the button below to verify your email address and activate your Martino Noir account.
        This link expires in <strong>${expiresInHours} hours</strong>.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${verifyUrl}" style="display:inline-block;background:#0a0a0a;color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Verify Email Address</a>
      </div>
      <p style="color:#7B8794;font-size:12px;line-height:1.5;text-align:center;">
        If you didn't create a Martino Noir account, you can safely ignore this email.
      </p>`;

    return this.send({ to, subject: 'Verify Your Email — Martino Noir', html: this.brandedLayout(content) });
  }

  // ── Template: Account Locked ──

  async sendAccountLockAlert(to: string, firstName: string, lockDurationMinutes: number, ipAddress?: string): Promise<EmailResult> {
    const content = `
      <div style="background:#FEF3F2;border:1px solid #FECDC9;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <h2 style="margin:0 0 8px 0;font-size:20px;color:#B42318;">🔒 Account Temporarily Locked</h2>
        <p style="margin:0;font-size:14px;color:#7A271A;line-height:1.5;">
          Hi ${firstName}, your account has been locked due to multiple failed login attempts.
        </p>
      </div>
      ${ipAddress ? `<p style="color:#1F2933;font-size:13px;">Login attempt detected from IP: <strong>${ipAddress}</strong></p>` : ''}
      <p style="color:#1F2933;font-size:14px;line-height:1.6;">
        Your account has been locked for <strong>${lockDurationMinutes} minutes</strong> as a security precaution.
        After the lockout period, you can sign in normally. If you believe this was not you, please reset your password immediately.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/forgot-password" style="display:inline-block;background:#B42318;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Reset Password</a>
      </div>`;

    return this.send({ to, subject: '🔒 Account Locked — Security Alert', html: this.brandedLayout(content) });
  }

  // ── Template: Staff Invitation ──

  async sendStaffInvitation(to: string, firstName: string, inviterName: string, role: string, resetToken: string): Promise<EmailResult> {
    const setupUrl = `${process.env['ADMIN_URL'] ?? 'http://localhost:3003'}/set-password?token=${resetToken}`;
    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;background:#EEF4FC;border-radius:50%;margin:0 auto 16px;line-height:56px;font-size:28px;">👋</div>
        <h1 style="margin:0;font-size:24px;color:#0a0a0a;">You've Been Invited</h1>
        <p style="margin:8px 0 0;color:#5A6775;font-size:14px;">Hi ${firstName}, ${inviterName} invited you to join Martino Noir</p>
      </div>
      <div style="background:#f6f9fd;border-radius:8px;padding:16px 20px;margin:24px 0;">
        <p style="margin:0;font-size:13px;color:#7B8794;">Your role</p>
        <p style="margin:4px 0 0;font-size:16px;font-weight:600;color:#0a0a0a;">${role.replace(/_/g, ' ')}</p>
      </div>
      <p style="color:#1F2933;font-size:14px;line-height:1.6;">
        Click the button below to set your password and activate your staff account. This link expires in <strong>48 hours</strong>.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${setupUrl}" style="display:inline-block;background:#0B3D91;color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Set Password & Activate</a>
      </div>
      <div style="background:#FEF3F2;border-radius:8px;padding:12px 16px;margin-top:24px;">
        <p style="margin:0;color:#B42318;font-size:12px;">⚠️ This link is single-use. Never share it. If you didn't expect this email, contact support immediately.</p>
      </div>`;

    return this.send({ to, subject: `You've been invited to Martino Noir Admin — ${role}`, html: this.brandedLayout(content) });
  }
}
