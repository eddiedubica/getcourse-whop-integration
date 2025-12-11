const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Create Whop checkout from GetCourse order
 * GET/POST /api/create-checkout
 * 
 * Expected parameters from GetCourse:
 * - deal_number: Order number
 * - user_email: User email
 * - user_name: User name (optional)
 * - deal_cost: Order amount
 * - offer_title: Offer title (optional)
 * - currency: Currency (optional, defaults to USD)
 */
router.all('/create-checkout', async (req, res) => {
  try {
    // Get parameters from both GET and POST
    const params = { ...req.query, ...req.body };
    
    console.log('[CREATE-CHECKOUT] Received request:', params);
    
    // Validate required parameters
    if (!params.deal_number || !params.user_email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        required: ['deal_number', 'user_email']
      });
    }
    
    // Create checkout in Whop
    const whopResponse = await createWhopCheckout({
      dealNumber: params.deal_number,
      userEmail: params.user_email,
      userName: params.user_name || '',
      dealCost: params.deal_cost || '',
      offerTitle: params.offer_title || 'Order',
      currency: params.currency || 'USD'
    });
    
    if (!whopResponse.success) {
      throw new Error(whopResponse.error || 'Failed to create Whop checkout');
    }
    
    console.log('[CREATE-CHECKOUT] Whop checkout created:', whopResponse.checkoutUrl);
    
    // Return checkout URL for redirect
    res.json({
      success: true,
      checkout_url: whopResponse.checkoutUrl,
      session_id: whopResponse.sessionId
    });
    
  } catch (error) {
    console.error('[CREATE-CHECKOUT] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create checkout session in Whop via API v2
 */
async function createWhopCheckout(data) {
  try {
    const response = await axios.post(
      'https://api.whop.com/v2/checkout_sessions',
      {
        plan_id: process.env.WHOP_PLAN_ID || 'plan_SGVT1cWHcicSo',
        metadata: {
          deal_number: data.dealNumber,
          user_email: data.userEmail,
          user_name: data.userName,
          deal_cost: data.dealCost,
          offer_title: data.offerTitle,
          currency: data.currency,
          source: 'getcourse'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHOP_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const session = response.data;
    
    // Whop может вернуть URL в разных полях
    const checkoutUrl = session.checkout_url || session.url || session.payment_url;
    
    if (!checkoutUrl) {
      throw new Error('No checkout URL returned from Whop');
    }
    
    return {
      success: true,
      checkoutUrl: checkoutUrl,
      sessionId: session.id
    };
    
  } catch (error) {
    console.error('[WHOP-API] Error creating checkout:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Webhook from Whop after successful payment
 * POST /api/whop-webhook
 */
router.post('/whop-webhook', async (req, res) => {
  try {
    console.log('[WHOP-WEBHOOK] Received webhook:', req.body);
    
    const event = req.body;
    
    // Handle payment success event
    if (event.type === 'payment.succeeded' || event.type === 'checkout.completed') {
      const metadata = event.data?.metadata || {};
      const dealNumber = metadata.deal_number;
      
      if (dealNumber) {
        console.log(`[WHOP-WEBHOOK] Payment succeeded for deal ${dealNumber}`);
        
        // TODO: Update GetCourse order status to "paid"
        // await updateGetCourseOrder(dealNumber, 'payed');
      }
    }
    
    // Always return 200 to acknowledge webhook receipt
    res.json({ received: true });
    
  } catch (error) {
    console.error('[WHOP-WEBHOOK] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update GetCourse order status (для будущего использования)
 */
async function updateGetCourseOrder(dealNumber, status) {
  try {
    const params = {
      user: {
        email: "" // нужен email пользователя
      },
      deal: {
        deal_number: dealNumber,
        deal_status: status
      }
    };
    
    const paramsBase64 = Buffer.from(JSON.stringify(params)).toString('base64');
    
    const response = await axios.post(
      'https://course.coral-santoro.com/pl/api/deals',
      new URLSearchParams({
        action: 'add',
        key: process.env.GETCOURSE_API_KEY,
        params: paramsBase64
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    console.log('[GETCOURSE-API] Order updated:', response.data);
    return response.data;
    
  } catch (error) {
    console.error('[GETCOURSE-API] Error updating order:', error.message);
    throw error;
  }
}

module.exports = router;
