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
export declare class EmailService {
    private readonly logger;
    private readonly accountId;
    private readonly clientId;
    private readonly clientSecret;
    private readonly refreshToken;
    private readonly region;
    private readonly fromAddress;
    private readonly isConfigured;
    private accessToken;
    private tokenExpiresAt;
    private readonly logoUrl;
    constructor();
    private getAccessToken;
    send(input: SendEmailInput): Promise<EmailResult>;
    private httpsRequest;
    private brandedLayout;
    sendOrderConfirmation(to: string, orderNumber: string, grandTotal: number, currency: string, items?: Array<{
        name: string;
        variant: string;
        quantity: number;
        price: number;
    }>): Promise<EmailResult>;
    sendShippingNotification(to: string, orderNumber: string, trackingNumber?: string, carrier?: string, estimatedDays?: {
        min: number;
        max: number;
    }): Promise<EmailResult>;
    sendOrderDelivered(to: string, orderNumber: string): Promise<EmailResult>;
    sendPasswordReset(to: string, resetToken: string, expiresInMinutes: number, resetPath?: string, portalLabel?: string): Promise<EmailResult>;
    sendWelcome(to: string, firstName: string): Promise<EmailResult>;
    sendLowStockAlert(to: string, sku: string, variantName: string, currentStock: number): Promise<EmailResult>;
    sendEmailVerification(to: string, firstName: string, verificationToken: string, expiresInHours?: number): Promise<EmailResult>;
    sendAccountLockAlert(to: string, firstName: string, lockDurationMinutes: number, ipAddress?: string): Promise<EmailResult>;
    sendStaffInvitation(to: string, firstName: string, inviterName: string, role: string, resetToken: string): Promise<EmailResult>;
}
