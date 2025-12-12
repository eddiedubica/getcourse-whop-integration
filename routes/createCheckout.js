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
    
    // Опция 1: Прямой редирект на Whop (раскомментируйте это)
    // res.redirect(302, whopResponse.checkoutUrl);
    
    // Опция 2: Вернуть JSON с URL (для использования с JavaScript)
    res.json({
      success: true,
      checkout_url: whopResponse.checkoutUrl,
      session_id: whopResponse.sessionId
    });
    
    // Опция 3: Сохранить в GetCourse и использовать доп. поле (закомментировано)
    /*
    const saveResult = await saveCheckoutUrlToOrder(
      params.deal_number,
      params.user_email,
      whopResponse.checkoutUrl
    );
    
    if (saveResult.success) {
      console.log('[CREATE-CHECKOUT] Checkout URL saved to GetCourse order');
    }
    */
    
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
  // Парсим цену
  const price = parseFloat(dealCost.toString().replace(/[^0-9.]/g, ''));
  
  // Выбираем план по цене
  if (price >= 9997) return process.env.WHOP_PLAN_9997 || 'plan_kUSaoXKGavfht'; // $9997
  if (price >= 3997) return process.env.WHOP_PLAN_3997 || 'plan_waaMKQH22eDJK'; // $3997
  if (price >= 1997) return process.env.WHOP_PLAN_1997 || 'plan_avmd2tOmTwVTB'; // $1997
  if (price >= 997) return process.env.WHOP_PLAN_997 || 'plan_SGVT1cWHcicSo'; // $997
  
  // По умолчанию самый дешёвый
  return process.env.WHOP_PLAN_997 || 'plan_SGVT1cWHcicSo';
}

/**
 * Create checkout session in Whop via API v2
 */
async function createWhopCheckout(data) {
  try {
    // Выбираем нужный план по цене
    const planId = selectPlanByPrice(data.dealCost);
    
    console.log(`[WHOP-API] Selected plan ${planId} for price ${data.dealCost}`);
    
    const response = await axios.post(
      'https://api.whop.com/v2/checkout_sessions',
      {
        plan_id: planId,
        metadata: {
          deal_number: data.dealNumber,
          user_email: data.userEmail,
          userphone: data.user_Phone
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
    
    // Whop v2 возвращает purchase_url для перенаправления
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
 * Save checkout URL back to GetCourse order
 */
async function saveCheckoutUrlToOrder(dealNumber, userEmail, checkoutUrl) {
  try {
    // Проверяем наличие API ключа GetCourse
    if (!process.env.GETCOURSE_API_KEY) {
      console.warn('[GETCOURSE-API] API key not configured, skipping save');
      return { success: false, error: 'API key not configured' };
    }
    
    const params = {
      user: {
        email: userEmail
      },
      deal: {
        deal_number: dealNumber,
        addfields: {
          "whop_checkout_url": checkoutUrl
        }
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
    
    console.log('[GETCOURSE-API] Checkout URL saved to order:', response.data);
    
    return {
      success: response.data.success === true || response.data.success === 'true',
      data: response.data
    };
    
  } catch (error) {
    console.error('[GETCOURSE-API] Error saving checkout URL:', {
      message: error.message,
      response: error.response?.data
    });
    
    return {
      success: false,
      error: error.message
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
      const userEmail = metadata.user_email;
      
      if (dealNumber && userEmail) {
        console.log(`[WHOP-WEBHOOK] Payment succeeded for deal ${dealNumber}`);
        
        // Update GetCourse order status to "paid"
        await updateGetCourseOrderStatus(dealNumber, userEmail, 'payed');
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
 * Update GetCourse order status
 */
async function updateGetCourseOrderStatus(dealNumber, userEmail, status) {
  try {
    if (!process.env.GETCOURSE_API_KEY) {
      console.warn('[GETCOURSE-API] API key not configured, skipping update');
      return;
    }
    
    const params = {
      user: {
        email: userEmail
      },
      deal: {
        deal_number: dealNumber,
        deal_status: status
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
    
    console.log('[GETCOURSE-API] Order status updated:', response.data);
    return response.data;
    
  } catch (error) {
    console.error('[GETCOURSE-API] Error updating order status:', error.message);
    throw error;
  }
}

module.exports = router;
