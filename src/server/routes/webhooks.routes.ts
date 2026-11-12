import { Router, Request, Response } from 'express';
import { paymentService } from '../payments/PaymentService.js';
import {
  processWhatsAppWebhookPost,
  verifyWhatsAppWebhookChallenge,
} from '../whatsapp/whatsappService.js';

const router = Router();

/**
 * GET /api/v1/webhooks/whatsapp
 * Official Meta Cloud API Webhook Challenge Verification
 */
router.get('/whatsapp', (req: Request, res: Response) => {
  const result = verifyWhatsAppWebhookChallenge(req.query as Record<string, any>);
  return res.status(result.status).send(result.body);
});

/**
 * POST /api/v1/webhooks/whatsapp
 * Official Meta Cloud API Webhook Notification Receiver (X-Hub-Signature-256)
 */
router.post('/whatsapp', (req: Request, res: Response) => {
  const rawBody =
    (req as any).rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
  const signature = req.headers['x-hub-signature-256'] as string | undefined;

  const result = processWhatsAppWebhookPost(rawBody, req.body, signature);
  if (!result.accepted) {
    return res.status(result.httpStatus).json({
      received: false,
      error: result.error,
    });
  }

  return res.status(200).json({
    received: true,
    processedEvents: result.processedEvents,
    duplicatesIgnored: result.duplicatesIgnored,
    outOfOrderIgnored: result.outOfOrderIgnored,
    crossTenantBlocked: result.crossTenantBlocked,
  });
});

/**
 * POST /api/v1/webhooks/mercadopago
 * Secure webhook endpoint for Mercado Pago payment notifications
 */
router.post('/mercadopago', async (req: Request, res: Response) => {
  try {
    const result = await paymentService.processWebhook({
      headers: req.headers,
      query: req.query,
      body: req.body,
    });

    return res.status(200).json({
      received: true,
      result,
    });
  } catch (error: any) {
    // If signature is invalid, return 401 Unauthorized
    if (error.message?.includes('Assinatura do webhook inválida')) {
      return res.status(401).json({
        received: false,
        error: error.message,
      });
    }

    // For other errors (like conflict or processing error), return 200 with error log
    // so Mercado Pago does not endlessly hammer the endpoint for business conflicts,
    // while still recording the failure.
    return res.status(200).json({
      received: true,
      error: error.message || 'Webhook processed with error',
    });
  }
});

export default router;

