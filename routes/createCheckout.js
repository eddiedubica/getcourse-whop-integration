const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Временная база для хранения checkout_url
 * В продакшене лучше заменить на Redis/MongoDB
 */
const checkoutDB = {}; // { email: checkout_url }

/**
 * Create Whop checkout from GetCourse order
 * GET/POST /api/create-checkout
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

    // Создаём checkout в Whop
    const whopResponse = await createWhopCheckout({
      dealNumber: params.deal_number,
      userEmail: params.user_email,
      userPhone: params.user_phone,
      userName: params.user_name || '',
      dealCost: params.deal_cost || '',
      offerTitle: params.offer_title || 'Order',
      currency: params.currency || 'USD'
    });

    if (!whopResponse.success) {
      throw new Error(whopResponse.error || 'Failed to create Whop checkout');
    }

    console.log('[CREATE-CHECKOUT] Whop checkout created:', whopResponse.checkoutUrl);

    // Сохраняем checkout_url в памяти
    checkoutDB[params.user_email] = whopResponse.checkoutUrl;

    // Возвращаем JSON с ссылкой
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
 * GET /api/get-checkout
 * Возвращает checkout_url по email для страницы GC
 */
router.get("/get-checkout", (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ status: "error", error: "Email required" });

  const checkout_url = checkoutDB[email];
  if (!checkout_url) return res.json({ status: "pending" });

  return res.json({ status: "ok", checkout_url });
});

/**
 * Select plan based on price
 */
function selectPlanByPrice(dealCost) {
  const price = parseFloat(dealCost.toString().replace(/[^0-9.]/g, ''));

  if (price >= 9997) return process.env.WHOP_PLAN_9997 || 'plan_kUSaoXKGavfht';
  if (price >= 3997) return process.env.WHOP_PLAN_3997 || 'plan_waaMKQH22eDJK';
  if (price >= 1997) return process.env.WHOP_PLAN_1997 || 'plan_avmd2tOmTwVTB';
  if (price >= 997) return process.env.WHOP_PLAN_997 || 'plan_SGVT1cWHcicSo';
  if (price >= 1) return process.env.WHOP_PLAN_1 || 'plan_yZnItTo7XpLWr';

  return process.env.WHOP_PLAN_1 || 'plan_yZnItTo7XpLWr';
}

/**
 * Create checkout session in Whop via API v2
 */
async function createWhopCheckout(data) {
  try {
    const planId = selectPlanByPrice(data.dealCost);

    console.log(`[WHOP-API] Selected plan ${planId} for price ${data.dealCost}`);

    const response = await axios.post(
      'https://api.whop.com/v2/checkout_sessions',
      {
        plan_id: planId,
        metadata: {
          deal_number: data.dealNumber,
          user_email: data.userEmail,
          userphone: data.userPhone,
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
    console.log('[WHOP-API] Session created successfully:', session);

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

    if (event.type === 'payment.succeeded' || event.type === 'checkout.completed') {
      const metadata = event.data?.metadata || {};
      const dealNumber = metadata.deal_number;
      const userEmail = metadata.user_email;

      if (dealNumber && userEmail) {
        console.log(`[WHOP-WEBHOOK] Payment succeeded for deal ${dealNumber}`);
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
 * Update GetCourse order status
 */
async function updateGetCourseOrderStatus(dealNumber, userEmail, status) {
  try {
    if (!process.env.GETCOURSE_API_KEY) {
      console.warn('[GETCOURSE-API] API key not configured, skipping update');
      return;
    }

    const params = {
      user: { email: userEmail },
      deal: { deal_number: dealNumber, deal_status: status }
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    console.log('[GETCOURSE-API] Order status updated:', response.data);
    return response.data;

  } catch (error) {
    console.error('[GETCOURSE-API] Error updating order status:', error.message);
    throw error;
  }
}

module.exports = router;
