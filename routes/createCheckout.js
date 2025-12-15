const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Create Whop checkout from GetCourse order
 * GET/POST /api/create-checkout
 */
router.all('/create-checkout', async (req, res) => {
  try {
    const params = { ...req.query, ...req.body };
    
    console.log('[CREATE-CHECKOUT] Received request:', params);
    
    // Validate required parameters
    if (!params.user_email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: user_email'
      });
    }
    
    // Create checkout in Whop
    const whopResponse = await createWhopCheckout({
      dealNumber: params.deal_number || 'ORDER_' + Date.now(),
      userEmail: params.user_email,
      userName: params.user_name || 'Customer',
      dealCost: params.deal_cost || '997',
      offerTitle: params.offer_title || 'Order',
      currency: params.currency || 'USD'
    });
    
    if (!whopResponse.success) {
      throw new Error(whopResponse.error || 'Failed to create Whop checkout');
    }
    
    console.log('[CREATE-CHECKOUT] Whop checkout created:', whopResponse.checkoutUrl);
    
    // Optionally save checkout URL to GetCourse order
    if (process.env.GETCOURSE_API_KEY && params.deal_number) {
      await saveCheckoutUrlToOrder(
        params.deal_number,
        params.user_email,
        whopResponse.checkoutUrl
      );
    }
    
    // Return checkout URL
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
 * Select plan based on price
 */
function selectPlanByPrice(dealCost) {
  const price = parseFloat(dealCost.toString().replace(/[^0-9.]/g, ''));
  
  console.log(`[PLAN-SELECT] Raw: ${dealCost}, Parsed: ${price}`);
  
  if (price >= 9997) {
    console.log('[PLAN-SELECT] Selected: $9997 plan');
    return process.env.WHOP_PLAN_9997 || 'plan_kUSaoXKGavfht';
  }
  if (price >= 3997) {
    console.log('[PLAN-SELECT] Selected: $3997 plan');
    return process.env.WHOP_PLAN_3997 || 'plan_waaMKQH22eDJK';
  }
  if (price >= 1997) {
    console.log('[PLAN-SELECT] Selected: $1997 plan');
    return process.env.WHOP_PLAN_1997 || 'plan_avmd2tOmTwVTB';
  }
  if (price >= 997) {
    console.log('[PLAN-SELECT] Selected: $997 plan');
    return process.env.WHOP_PLAN_997 || 'plan_SGVT1cWHcicSo';
  }
  
  console.log('[PLAN-SELECT] Selected: default $997 plan');
  return process.env.WHOP_PLAN_997 || 'plan_SGVT1cWHcicSo';
}

/**
 * Create checkout session in Whop via API v2
 */
async function createWhopCheckout(data) {
  try {
    const planId = selectPlanByPrice(data.dealCost);
    
    const response = await axios.post(
      'https://api.whop.com/v2/checkout_sessions',
      {
        plan_id: planId,
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
    
    console.log('[WHOP-API] Session created:', session);
    
    const checkoutUrl = session.purchase_url || session.checkout_url || session.url;
    
    if (!checkoutUrl) {
      console.error('[WHOP-API] No URL in response:', JSON.stringify(session));
      throw new Error('No checkout URL returned from Whop');
    }
    
    return {
      success: true,
      checkoutUrl: checkoutUrl,
      sessionId: session.id
    };
    
  } catch (error) {
    console.error('[WHOP-API] Error:', {
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
 * Save checkout URL to GetCourse order
 */
async function saveCheckoutUrlToOrder(dealNumber, userEmail, checkoutUrl) {
  try {
    if (!process.env.GETCOURSE_API_KEY) {
      console.warn('[GETCOURSE-API] API key not configured');
      return { success: false };
    }
    
    const params = {
      user: { email: userEmail },
      deal: {
        deal_number: dealNumber,
        addfields: { "whop_checkout_url": checkoutUrl }
      }
    };
    
    const paramsBase64 = Buffer.from(JSON.stringify(params)).toString('base64');
    
    const response = await axios.post(
      `https://${process.env.GETCOURSE_ACCOUNT || 'course.coral-santoro'}.com/pl/api/deals`,
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
    
    console.log('[GETCOURSE-API] URL saved to order:', response.data);
    return { success: true };
    
  } catch (error) {
    console.error('[GETCOURSE-API] Error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = router;
