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
    
    // Get webhook signature from headers
    const signature = req.headers['webhook-signature'];
    const timestamp = req.headers['webhook-timestamp'];
    const webhookId = req.headers['webhook-id'];
    
    // Parse body
    const rawBody = req.body.toString('utf8');
    const webhookData = JSON.parse(rawBody);
    
    console.log('[WHOP-WEBHOOK] Event type:', webhookData.type);
    
    // Verify webhook signature (Standard Webhooks)
    if (process.env.WHOP_WEBHOOK_SECRET) {
      const isValid = verifyWhopWebhook(signature, timestamp, rawBody);
      if (!isValid) {
        console.error('[WHOP-WEBHOOK] Invalid signature');
        return res.status(401).json({ success: false, error: 'Invalid signature' });
      }
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
        // You might want to implement a retry mechanism here
      } else {
        console.log('[WHOP-WEBHOOK] GetCourse order updated successfully');
      }
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
 */
function verifyWhopWebhook(signature, timestamp, body) {
  try {
    if (!signature || !timestamp) {
      return false;
    }
    
    // Standard Webhooks uses HMAC-SHA256
    const secret = Buffer.from(process.env.WHOP_WEBHOOK_SECRET, 'base64');
    const signedContent = `${webhookId}.${timestamp}.${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedContent)
      .digest('base64');
    
    // Extract signature from header (format: "v1,signature")
    const signatures = signature.split(',');
    for (const sig of signatures) {
      if (sig.trim() === `v1=${expectedSignature}`) {
        return true;
      }
    }
    
    return false;
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
    
    // Send request to GetCourse API
    const response = await axios.post(
      `https://${accountName}.getcourse.ru/pl/api/deals`,
      null,
      {
        params: {
          action: 'add',
          key: apiKey,
          params: params
        }
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
    console.error('[GETCOURSE-API] Error updating order:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error_message || error.message
    };
  }
}

module.exports = router;
