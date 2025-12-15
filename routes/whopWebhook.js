const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

/**
 * Receive webhook from Whop when payment is successful
 * POST /api/whop-webhook
 * 
 * Whop sends webhook with Standard Webhooks specification
 * Event: payment.succeeded
 */
router.post('/whop-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    console.log('[WHOP-WEBHOOK] Received webhook');
    
    // Get webhook headers
    const signature = req.headers['webhook-signature'];
    const timestamp = req.headers['webhook-timestamp'];
    const webhookId = req.headers['webhook-id'];
    
    // Parse body
    const rawBody = req.body.toString('utf8');
    const webhookData = JSON.parse(rawBody);
    
    console.log('[WHOP-WEBHOOK] Event type:', webhookData.type);
    console.log('[WHOP-WEBHOOK] Headers:', { webhookId, timestamp });
    
    // Verify webhook signature (Standard Webhooks)
    if (process.env.WHOP_WEBHOOK_SECRET) {
      const isValid = verifyWhopWebhook(webhookId, signature, timestamp, rawBody);
      if (!isValid) {
        console.error('[WHOP-WEBHOOK] Invalid signature');
        return res.status(401).json({ success: false, error: 'Invalid signature' });
      }
      console.log('[WHOP-WEBHOOK] Signature verified');
    } else {
      console.warn('[WHOP-WEBHOOK] Webhook secret not configured, skipping signature verification');
    }
    
    // Handle payment.succeeded event
    if (webhookData.type === 'payment.succeeded') {
      const paymentData = webhookData.data;
      const metadata = paymentData.metadata || {};
      
      console.log('[WHOP-WEBHOOK] Payment succeeded:', {
        paymentId: paymentData.id,
        amount: paymentData.amount,
        dealNumber: metadata.deal_number
      });
      
      // Update order status in GetCourse
      const updateResult = await updateGetCourseOrder({
        dealNumber: metadata.deal_number,
        userEmail: metadata.user_email,
        paymentId: paymentData.id,
        paymentAmount: paymentData.amount / 100, // Convert from cents
        paymentStatus: 'accepted',
        dealStatus: 'payed'
      });
      
      if (!updateResult.success) {
        console.error('[WHOP-WEBHOOK] Failed to update GetCourse order:', updateResult.error);
        // Still return 200 to Whop to avoid retries, but log the error
        // In production, implement a retry queue (Bull, RabbitMQ, etc.)
      } else {
        console.log('[WHOP-WEBHOOK] GetCourse order updated successfully');
      }
    } else if (webhookData.type === 'payment.failed') {
      console.warn('[WHOP-WEBHOOK] Payment failed:', webhookData.data);
    } else {
      console.log('[WHOP-WEBHOOK] Unhandled event type:', webhookData.type);
    }
    
    // Always return 200 to Whop to acknowledge receipt
    res.status(200).json({ success: true, received: true });
    
  } catch (error) {
    console.error('[WHOP-WEBHOOK] Error:', error.message);
    // Return 200 even on error to avoid Whop retrying
    res.status(200).json({ success: false, error: error.message });
  }
});

/**
 * Verify Whop webhook signature using Standard Webhooks specification
 * Format: v1,<base64-encoded-signature>
 */
function verifyWhopWebhook(webhookId, signature, timestamp, body) {
  try {
    if (!signature || !timestamp || !webhookId) {
      console.error('[WHOP-WEBHOOK] Missing signature components');
      return false;
    }
    
    // Standard Webhooks uses HMAC-SHA256
    const secret = process.env.WHOP_WEBHOOK_SECRET;
    if (!secret) {
      return false;
    }
    
    // Decode base64 secret
    const secretBytes = Buffer.from(secret, 'base64');
    
    // Create signed content: "webhook_id.timestamp.body"
    const signedContent = `${webhookId}.${timestamp}.${body}`;
    
    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');
    
    console.log('[WHOP-WEBHOOK] Signature verification:', {
      received: signature,
      expected: `v1,${expectedSignature}`
    });
    
    // Parse incoming signature (format: "v1,<signature>" or just "<signature>")
    let incomingSignature = signature;
    if (signature.includes(',')) {
      const parts = signature.split(',');
      incomingSignature = parts[1] || parts[0];
    }
    
    // Compare signatures
    const isValid = incomingSignature.trim() === expectedSignature.trim();
    
    return isValid;
  } catch (error) {
    console.error('[WHOP-WEBHOOK] Signature verification error:', error.message);
    return false;
  }
}

/**
 * Update order status in GetCourse via API
 */
async function updateGetCourseOrder(data) {
  try {
    const accountName = process.env.GETCOURSE_ACCOUNT_NAME;
    const apiKey = process.env.GETCOURSE_API_KEY;
    
    if (!accountName || !apiKey) {
      throw new Error('GetCourse credentials not configured');
    }
    
    // Prepare order data
    const orderData = {
      user: {
        email: data.userEmail
      },
      deal: {
        deal_number: data.dealNumber,
        deal_status: data.dealStatus
      },
      payment: {
        payment_id: data.paymentId,
        payment_amount: data.paymentAmount,
        payment_status: data.paymentStatus,
        payment_type: 'CARD'
      }
    };
    
    // Encode to base64
    const params = Buffer.from(JSON.stringify(orderData)).toString('base64');
    
    console.log('[GETCOURSE-API] Sending order update:', {
      dealNumber: data.dealNumber,
      userEmail: data.userEmail,
      paymentId: data.paymentId
    });
    
    // Send request to GetCourse API
    const response = await axios.post(
      `https://${accountName}.getcourse.ru/pl/api/deals`,
      null,
      {
        params: {
          action: 'add',
          key: apiKey,
          params: params
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    console.log('[GETCOURSE-API] Response:', response.data);
    
    if (response.data.success === false) {
      return {
        success: false,
        error: response.data.error_message || 'Unknown error'
      };
    }
    
    return {
      success: true,
      data: response.data
    };
    
  } catch (error) {
    console.error('[GETCOURSE-API] Error updating order:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    return {
      success: false,
      error: error.response?.data?.error_message || error.message
    };
  }
}

module.exports = router;
