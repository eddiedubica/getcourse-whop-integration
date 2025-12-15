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
 * - offer_id: Offer ID (optional)
 * - offer_title: Offer title (optional)
 * - callback_secret: Security token (optional)
 */
router.all('/create-checkout', async (req, res) => {
  try {
    // Get parameters from both GET and POST
    const params = { ...req.query, ...req.body };
    
    console.log('[CREATE-CHECKOUT] Received request:', params);
    
    // Validate required parameters
    if (!params.deal_number || !params.user_email || !params.deal_cost) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        required: ['deal_number', 'user_email', 'deal_cost']
      });
    }
    
    // Optional: Verify callback secret for security
    if (process.env.GETCOURSE_CALLBACK_SECRET) {
      if (params.callback_secret !== process.env.GETCOURSE_CALLBACK_SECRET) {
        console.error('[CREATE-CHECKOUT] Invalid callback secret');
        return res.status(403).json({
          success: false,
          error: 'Unauthorized'
        });
      }
    }
    
    // Parse deal cost (remove currency symbols, convert to cents)
    const dealCostFloat = parseFloat(params.deal_cost.toString().replace(/[^0-9.]/g, ''));
    const dealCostCents = Math.round(dealCostFloat * 100);
    
    // Create checkout configuration in Whop
    const whopResponse = await createWhopCheckout({
      dealNumber: params.deal_number,
      userEmail: params.user_email,
      userName: params.user_name || '',
      amount: dealCostCents,
      offerId: params.offer_id || '',
      offerTitle: params.offer_title || 'Order'
    });
    
    if (!whopResponse.success) {
      throw new Error(whopResponse.error || 'Failed to create Whop checkout');
    }
    
    console.log('[CREATE-CHECKOUT] Whop checkout created:', whopResponse.checkoutUrl);
    
    // Return checkout URL for redirect
    res.json({
      success: true,
      checkout_url: whopResponse.checkoutUrl,
      plan_id: whopResponse.planId,
      checkout_config_id: whopResponse.checkoutConfigId
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
 * Create checkout in Whop via API
 */
async function createWhopCheckout(data) {
  try {
    // Create checkout configuration
    const response = await axios.post(
      'https://api.whop.com/v1/checkout_configurations',
      {
        plan: {
          company_id: process.env.WHOP_COMPANY_ID,
          initial_price: data.amount,
          plan_type: 'one_time',
          release_method: 'buy_now'
        },
        metadata: {
          deal_number: data.dealNumber,
          user_email: data.userEmail,
          user_name: data.userName,
          offer_id: data.offerId,
          offer_title: data.offerTitle,
          source: 'getcourse'
        },
        redirect_url: process.env.SUCCESS_REDIRECT_URL,
        cancel_url: process.env.CANCEL_REDIRECT_URL
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHOP_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const checkoutConfig = response.data;
    const planId = checkoutConfig.plan.id;
    const checkoutConfigId = checkoutConfig.id;
    
    // Generate checkout URL
    const checkoutUrl = `https://whop.com/checkout/${planId}?checkout_config=${checkoutConfigId}`;
    
    return {
      success: true,
      checkoutUrl,
      planId,
      checkoutConfigId
    };
    
  } catch (error) {
    console.error('[WHOP-API] Error creating checkout:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

module.exports = router;
