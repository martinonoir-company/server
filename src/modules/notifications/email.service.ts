import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Email service using Zohomail SMTP transport via Nodemailer.
 * In development (no SMTP_HOST set), logs emails to console instead of sending.
 *
 * Required env vars for production:
 *   SMTP_HOST=smtp.zoho.com
 *   SMTP_PORT=465
 *   SMTP_USER=noreply@martinonoir.com
 *   SMTP_PASS=<app password>
 *   SMTP_FROM="Martinonoir" <noreply@martinonoir.com>
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private readonly fromAddress: string;

  constructor() {
    const host = process.env['SMTP_HOST'];
    const port = parseInt(process.env['SMTP_PORT'] ?? '465', 10);
    const user = process.env['SMTP_USER'];
    const pass = process.env['SMTP_PASS'];
    this.fromAddress = process.env['SMTP_FROM'] ?? '"Martinonoir" <noreply@martinonoir.com>';

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
      });
      this.logger.log(`Email transport configured: ${host}:${port} (${user})`);
    } else {
      this.logger.warn('SMTP credentials not set — emails will be logged to console');
    }
  }

  async send(input: SendEmailInput): Promise<EmailResult> {
    const recipients = Array.isArray(input.to) ? input.to.join(', ') : input.to;

    if (!this.transporter) {
      this.logger.log(`[DEV EMAIL] To: ${recipients} | Subject: ${input.subject}\n${input.html.replace(/<[^>]*>/g, '').slice(0, 300)}`);
      return { success: true, messageId: `dev-${Date.now()}` };
    }

    try {
      const info = await this.transporter.sendMail({
        from: input.from ?? this.fromAddress,
        to: recipients,
        subject: input.subject,
        html: input.html,
        text: input.text,
        replyTo: input.replyTo,
        attachments: input.attachments,
      });

      this.logger.log(`Email sent to ${recipients}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send email to ${recipients}: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  // ── Branded Email Wrapper ──

  private brandedLayout(content: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Martinonoir</title>
</head>
<body style="margin: 0; padding: 0; background: #f6f9fd; font-family: 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f6f9fd;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          <!-- Header -->
          <tr>
            <td style="background: #0a0a0a; padding: 24px 32px; border-radius: 12px 12px 0 0;">
              <table width="100%"><tr>
                <td><span style="font-size: 20px; font-weight: 700; color: #fff; letter-spacing: 1px;">MARTINO<span style="color: #4A90E2;">NOIR</span></span></td>
                <td align="right"><span style="font-size: 12px; color: #9AA5B1;">Luxury Fashion</span></td>
              </tr></table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="background: #ffffff; padding: 32px; border-left: 1px solid #e4e7eb; border-right: 1px solid #e4e7eb;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background: #0a0a0a; padding: 24px 32px; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0 0 8px 0; color: #9AA5B1; font-size: 12px;">Martinonoir — Luxury Bags, Clothing & Accessories</p>
              <p style="margin: 0; color: #5A6775; font-size: 11px;">
                <a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3002'}" style="color: #4A90E2; text-decoration: none;">Website</a> &nbsp;|&nbsp;
                <a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3002'}/shop" style="color: #4A90E2; text-decoration: none;">Shop</a> &nbsp;|&nbsp;
                <a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3002'}/contact" style="color: #4A90E2; text-decoration: none;">Contact</a>
              </p>
              <p style="margin: 8px 0 0; color: #3B4754; font-size: 10px;">&copy; ${new Date().getFullYear()} Martinonoir. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  // ── Template: Order Confirmation ──

  async sendOrderConfirmation(
    to: string,
    orderNumber: string,
    grandTotal: number,
    currency: string,
    items?: Array<{ name: string; variant: string; quantity: number; price: number }>,
  ): Promise<EmailResult> {
    const formatted = currency === 'NGN'
      ? `₦${(grandTotal / 100).toLocaleString()}`
      : `$${(grandTotal / 100).toFixed(2)}`;

    const itemsHtml = items?.length
      ? `<table width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0; border-collapse: collapse;">
          <tr style="background: #f6f9fd;">
            <td style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: #3B4754; border-bottom: 1px solid #e4e7eb;">Item</td>
            <td style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: #3B4754; border-bottom: 1px solid #e4e7eb;" align="center">Qty</td>
            <td style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: #3B4754; border-bottom: 1px solid #e4e7eb;" align="right">Price</td>
          </tr>
          ${items.map(i => `
          <tr>
            <td style="padding: 10px 12px; font-size: 13px; color: #1F2933; border-bottom: 1px solid #f0f0f0;">
              <strong>${i.name}</strong><br/><span style="color: #7B8794; font-size: 11px;">${i.variant}</span>
            </td>
            <td style="padding: 10px 12px; font-size: 13px; color: #1F2933; border-bottom: 1px solid #f0f0f0;" align="center">${i.quantity}</td>
            <td style="padding: 10px 12px; font-size: 13px; color: #1F2933; border-bottom: 1px solid #f0f0f0;" align="right">${currency === 'NGN' ? '₦' : '$'}${(i.price / 100).toLocaleString()}</td>
          </tr>`).join('')}
        </table>`
      : '';

    const content = `
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 56px; height: 56px; background: #E6F4EC; border-radius: 50%; margin: 0 auto 16px; line-height: 56px; font-size: 28px;">✓</div>
        <h1 style="margin: 0; font-size: 24px; color: #0a0a0a;">Order Confirmed!</h1>
        <p style="margin: 8px 0 0; color: #5A6775; font-size: 14px;">Thank you for shopping with Martinonoir</p>
      </div>
      <div style="background: #f6f9fd; border-radius: 8px; padding: 16px 20px; margin: 24px 0; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #7B8794;">Order Number</p>
        <p style="margin: 4px 0 0; font-size: 18px; font-weight: 700; color: #0a0a0a; font-family: monospace;">${orderNumber}</p>
      </div>
      ${itemsHtml}
      <div style="background: #0B3D91; border-radius: 8px; padding: 16px 20px; text-align: center; margin: 24px 0;">
        <p style="margin: 0; color: rgba(255,255,255,0.7); font-size: 12px;">Total</p>
        <p style="margin: 4px 0 0; font-size: 28px; font-weight: 700; color: #fff;">${formatted}</p>
      </div>
      <p style="color: #5A6775; font-size: 13px; line-height: 1.6;">
        We're preparing your order for shipment. You'll receive another email with tracking information once it ships.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3002'}/account" style="display: inline-block; background: #0a0a0a; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">View My Orders</a>
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
      ? `<div style="background: #f6f9fd; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
          <p style="margin: 0; font-size: 12px; color: #7B8794;">Tracking Number</p>
          <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; color: #0a0a0a; font-family: monospace;">${trackingNumber}</p>
          ${carrier ? `<p style="margin: 4px 0 0; font-size: 12px; color: #5A6775;">Carrier: ${carrier}</p>` : ''}
          ${estimatedDays ? `<p style="margin: 4px 0 0; font-size: 12px; color: #5A6775;">Estimated delivery: ${estimatedDays.min}–${estimatedDays.max} business days</p>` : ''}
        </div>`
      : '';

    const content = `
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 56px; height: 56px; background: #E6F4EC; border-radius: 50%; margin: 0 auto 16px; line-height: 56px; font-size: 28px;">📦</div>
        <h1 style="margin: 0; font-size: 24px; color: #0a0a0a;">Your Order Has Shipped!</h1>
        <p style="margin: 8px 0 0; color: #5A6775;">Order <strong>${orderNumber}</strong> is on its way</p>
      </div>
      ${trackingHtml}
      <p style="color: #5A6775; font-size: 13px; line-height: 1.6;">
        Your order has been carefully packed and handed to the courier. You can track your shipment using the tracking number above.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3002'}/track-order" style="display: inline-block; background: #0a0a0a; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Track Order</a>
      </div>`;

    return this.send({ to, subject: `Your Order ${orderNumber} Has Shipped! 📦`, html: this.brandedLayout(content) });
  }

  // ── Template: Password Reset ──

  async sendPasswordReset(to: string, resetToken: string, expiresInMinutes: number): Promise<EmailResult> {
    const resetUrl = `${process.env['FRONTEND_URL'] ?? 'http://localhost:3002'}/reset-password?token=${resetToken}`;

    const content = `
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 56px; height: 56px; background: #EEF4FC; border-radius: 50%; margin: 0 auto 16px; line-height: 56px; font-size: 28px;">🔐</div>
        <h1 style="margin: 0; font-size: 24px; color: #0a0a0a;">Reset Your Password</h1>
      </div>
      <p style="color: #1F2933; font-size: 14px; line-height: 1.6;">
        You requested a password reset for your Martinonoir account. Click the button below to set a new password:
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: #0B3D91; color: #fff; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Reset Password</a>
      </div>
      <p style="color: #7B8794; font-size: 12px; line-height: 1.5;">
        This link expires in <strong>${expiresInMinutes} minutes</strong>. If you didn't request a password reset, you can safely ignore this email.
      </p>
      <div style="background: #FEF3F2; border-radius: 8px; padding: 12px 16px; margin-top: 24px;">
        <p style="margin: 0; color: #B42318; font-size: 12px;">⚠️ Never share this link with anyone. Martinonoir support will never ask for your password.</p>
      </div>`;

    return this.send({ to, subject: 'Reset Your Password — Martinonoir', html: this.brandedLayout(content) });
  }

  // ── Template: Welcome ──

  async sendWelcome(to: string, firstName: string): Promise<EmailResult> {
    const content = `
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 56px; height: 56px; background: #EEF4FC; border-radius: 50%; margin: 0 auto 16px; line-height: 56px; font-size: 28px;">👋</div>
        <h1 style="margin: 0; font-size: 24px; color: #0a0a0a;">Welcome, ${firstName}!</h1>
        <p style="margin: 8px 0 0; color: #5A6775; font-size: 14px;">Thank you for joining Martinonoir</p>
      </div>
      <p style="color: #1F2933; font-size: 14px; line-height: 1.6;">
        You now have access to our exclusive collection of luxury bags, clothing, and accessories. Here's what you can do:
      </p>
      <ul style="color: #1F2933; font-size: 13px; line-height: 2; padding-left: 20px;">
        <li>Browse our curated collection</li>
        <li>Save items to your wishlist</li>
        <li>Enjoy complimentary shipping on orders over ₦150,000</li>
        <li>Track your orders in real-time</li>
      </ul>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3002'}/shop" style="display: inline-block; background: #0a0a0a; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Start Shopping</a>
      </div>`;

    return this.send({ to, subject: 'Welcome to Martinonoir ✨', html: this.brandedLayout(content) });
  }

  // ── Template: Low Stock Alert (Admin) ──

  async sendLowStockAlert(to: string, sku: string, variantName: string, currentStock: number): Promise<EmailResult> {
    const content = `
      <div style="background: #FEF3F2; border: 1px solid #FECDC9; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #B42318;">⚠️ Low Stock Alert</h2>
        <p style="margin: 0; font-size: 14px; color: #7A271A;">
          <strong>${variantName}</strong> (SKU: ${sku}) has only <strong>${currentStock} units</strong> remaining.
        </p>
      </div>
      <p style="color: #1F2933; font-size: 14px;">Please restock this item soon to avoid stockouts and lost sales.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${process.env['ADMIN_URL'] ?? 'http://localhost:3003'}/inventory" style="display: inline-block; background: #B42318; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Manage Inventory</a>
      </div>`;

    return this.send({ to, subject: `⚠️ Low Stock: ${variantName} (${sku}) — ${currentStock} left`, html: this.brandedLayout(content) });
  }

  // ── Template: Email Verification ──

  async sendEmailVerification(to: string, firstName: string, verificationToken: string, expiresInHours = 24): Promise<EmailResult> {
    const verifyUrl = `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/verify-email?token=${verificationToken}`;

    const content = `
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 56px; height: 56px; background: #E6F4EC; border-radius: 50%; margin: 0 auto 16px; line-height: 56px; font-size: 28px;">✉️</div>
        <h1 style="margin: 0; font-size: 24px; color: #0a0a0a;">Verify Your Email</h1>
        <p style="margin: 8px 0 0; color: #5A6775; font-size: 14px;">Hi ${firstName}, please confirm your email address</p>
      </div>
      <p style="color: #1F2933; font-size: 14px; line-height: 1.6;">
        Click the button below to verify your email address and activate your Martinonoir account.
        This link expires in <strong>${expiresInHours} hours</strong>.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${verifyUrl}" style="display: inline-block; background: #0a0a0a; color: #fff; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Verify Email Address</a>
      </div>
      <p style="color: #7B8794; font-size: 12px; line-height: 1.5; text-align: center;">
        If you didn't create a Martinonoir account, you can safely ignore this email.
      </p>`;

    return this.send({ to, subject: 'Verify Your Email — Martinonoir', html: this.brandedLayout(content) });
  }

  // ── Template: Account Locked (Security Alert) ──

  async sendAccountLockAlert(to: string, firstName: string, lockDurationMinutes: number, ipAddress?: string): Promise<EmailResult> {
    const content = `
      <div style="background: #FEF3F2; border: 1px solid #FECDC9; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #B42318;">🔒 Account Temporarily Locked</h2>
        <p style="margin: 0; font-size: 14px; color: #7A271A; line-height: 1.5;">
          Hi ${firstName}, your account has been locked due to multiple failed login attempts.
        </p>
      </div>
      ${ipAddress ? `<p style="color: #1F2933; font-size: 13px;">Login attempt detected from IP: <strong>${ipAddress}</strong></p>` : ''}
      <p style="color: #1F2933; font-size: 14px; line-height: 1.6;">
        Your account has been locked for <strong>${lockDurationMinutes} minutes</strong> as a security precaution.
        After the lockout period, you can sign in normally. If you believe this was not you, please reset your password immediately.
      </p>
      <div style="text-align: center; margin: 24px 0; display: flex; gap: 12px; justify-content: center;">
        <a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/forgot-password" style="display: inline-block; background: #B42318; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px;">Reset Password</a>
        <a href="${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/contact" style="display: inline-block; background: #0a0a0a; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px;">Contact Support</a>
      </div>`;

    return this.send({ to, subject: '🔒 Account Locked — Security Alert', html: this.brandedLayout(content) });
  }

  // ── Template: Staff Invitation ──

  async sendStaffInvitation(to: string, firstName: string, inviterName: string, role: string, resetToken: string): Promise<EmailResult> {
    const setupUrl = `${process.env['ADMIN_URL'] ?? 'http://localhost:3002'}/set-password?token=${resetToken}`;

    const content = `
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 56px; height: 56px; background: #EEF4FC; border-radius: 50%; margin: 0 auto 16px; line-height: 56px; font-size: 28px;">👋</div>
        <h1 style="margin: 0; font-size: 24px; color: #0a0a0a;">You've Been Invited</h1>
        <p style="margin: 8px 0 0; color: #5A6775; font-size: 14px;">Hi ${firstName}, ${inviterName} invited you to join Martinonoir</p>
      </div>
      <div style="background: #f6f9fd; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
        <p style="margin: 0; font-size: 13px; color: #7B8794;">Your role</p>
        <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600; color: #0a0a0a;">${role.replace(/_/g, ' ')}</p>
      </div>
      <p style="color: #1F2933; font-size: 14px; line-height: 1.6;">
        Click the button below to set your password and activate your staff account. This link expires in <strong>48 hours</strong>.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${setupUrl}" style="display: inline-block; background: #0B3D91; color: #fff; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Set Password & Activate</a>
      </div>
      <div style="background: #FEF3F2; border-radius: 8px; padding: 12px 16px; margin-top: 24px;">
        <p style="margin: 0; color: #B42318; font-size: 12px;">⚠️ This link is single-use. Never share it. If you didn't expect this email, contact support immediately.</p>
      </div>`;

    return this.send({ to, subject: `You've been invited to Martinonoir Admin — ${role}`, html: this.brandedLayout(content) });
  }
}
