const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Temporary DB for checkout_url (in RAM)
 */
const checkoutDB = {}; // { email: checkout_url }

/**
 * CREATE CHECKOUT
 * /api/create-checkout
 */
router.all('/create-checkout', async (req, res) => {
  try {
    const params = { ...req.query, ...req.body };
    console.log('[CREATE-CHECKOUT] Received request:', params);

    if (!params.deal_number || !params.user_email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        required: ['deal_number', 'user_email']
      });
    }

    const whopResponse = await createWhopCheckout({
      dealNumber: params.deal_number,
      userEmail: params.user_email,
      userPhone: params.user_phone || '',
      userName: params.user_name || '',
      dealCost: params.deal_cost || '',
      offerTitle: params.offer_title || 'Order',
      currency: params.currency || 'USD'
    });

    if (!whopResponse.success) {
      throw new Error(whopResponse.error);
    }

    checkoutDB[params.user_email] = whopResponse.checkoutUrl;

    res.json({
      success: true,
      checkout_url: whopResponse.checkoutUrl,
      session_id: whopResponse.sessionId
    });

  } catch (error) {
    console.error('[CREATE-CHECKOUT] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET CHECKOUT BY EMAIL
 */
router.get('/get-checkout', (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ status: 'error', error: 'Email required' });

  const checkout_url = checkoutDB[email];
  if (!checkout_url) return res.json({ status: 'pending' });

  return res.json({ status: 'ok', checkout_url });
});

/**
 * PLAN SELECTOR
 */
function selectPlanByPrice(dealCost) {
  const price = parseFloat(dealCost.toString().replace(/[^0-9.]/g, ''));

  console.log('[PLAN-SELECT] Parsed:', price);

  if (price >= 9997) return process.env.WHOP_PLAN_9997 || 'plan_kUSaoXKGavfht';
  if (price >= 3997) return process.env.WHOP_PLAN_3997 || 'plan_waaMKQH22eDJK';
  if (price >= 1997) return process.env.WHOP_PLAN_1997 || 'plan_avmd2tOmTwVTB';
  if (price >= 997) return process.env.WHOP_PLAN_997 || 'plan_SGVT1cWHcicSo';
  if (price >= 1) return process.env.WHOP_PLAN_1 || 'plan_yZnItTo7XpLWr';

  return process.env.WHOP_PLAN_1 || 'plan_yZnItTo7XpLWr';
}

/**
 * CREATE WHOP CHECKOUT
 */
async function createWhopCheckout(data) {
  try {
    const planId = selectPlanByPrice(data.dealCost);

    console.log(`[WHOP-API] Selected plan ${planId}`);

    const response = await axios.post(
      'https://api.whop.com/v2/checkout_sessions',
      {
        plan_id: planId,
        metadata: {
          deal_number: data.dealNumber,
          user_email: data.userEmail,
          user_phone: data.userPhone,
          user_name: data.userName,
          deal_cost: data.dealCost,
          offer_title: data.offerTitle,
          currency: data.currency,
          source: 'getcourse'
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHOP_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const session = response.data;

    const url = session.purchase_url || session.checkout_url || session.url;

    if (!url) throw new Error('No checkout URL returned from Whop');

    return { success: true, checkoutUrl: url, sessionId: session.id };

  } catch (error) {
    console.error('[WHOP-API] ERROR:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * WHOP WEBHOOK
 */
router.post('/whop-webhook', async (req, res) => {
  try {
    console.log('[WHOP-WEBHOOK] Received:', req.body);

    const event = req.body;

    if (['payment.succeeded', 'checkout.completed'].includes(event.type)) {
      const metadata = event.data?.metadata || {};
      const dealNumber = metadata.deal_number;
      const userEmail = metadata.user_email;

      if (dealNumber && userEmail) {
        await updateGetCourseOrderStatus(dealNumber, userEmail, 'payed');
      }
    }

    res.json({ received: true });

  } catch (error) {
    console.error('[WHOP-WEBHOOK] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * UPDATE ORDER IN GETCOURSE
 */
async function updateGetCourseOrderStatus(dealNumber, userEmail, status) {
  try {
    if (!process.env.GETCOURSE_API_KEY) {
      console.warn('No GC API key, skipping update');
      return;
    }

    const payload = {
      user: { email: userEmail },
      deal: { deal_number: dealNumber, deal_status: status }
    };

    const paramsBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');

    const response = await axios.post(
      `https://${process.env.GETCOURSE_ACCOUNT}.com/pl/api/deals`,
      new URLSearchParams({
        action: 'add',
        key: process.env.GETCOURSE_API_KEY,
        params: paramsBase64
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    console.log('[GETCOURSE-API] Updated:', response.data);

  } catch (error) {
    console.error('[GETCOURSE-API] ERROR:', error.message);
    throw error;
  }
}

module.exports = router;
