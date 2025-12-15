const express = require('express');
const router = express.Router();
const axios = require('axios');

// Временное хранилище сессий (в production использовать Redis)
const pendingCheckouts = new Map();

/**
 * Функция для выбора плана Whop по стоимости заказа
 * 
 * Доступные планы (реальные цены):
 * - $997 (WHOP_PLAN_997) - для заказов $0-1000
 * - $1,997 (WHOP_PLAN_1997) - для заказов $1001-3000
 * - $3,997 (WHOP_PLAN_3997) - для заказов $3001-5000
 * - $9,997 (WHOP_PLAN_9997) - для заказов $5001+
 */
function selectWhopPlanByPrice(amountUSD) {
  const plans = {
    plan_997: {
      id: process.env.WHOP_PLAN_997,
      minPrice: 0,
      maxPrice: 1000,
      name: '$997 Plan'
    },
    plan_1997: {
      id: process.env.WHOP_PLAN_1997,
      minPrice: 1001,
      maxPrice: 3000,
      name: '$1,997 Plan'
    },
    plan_3997: {
      id: process.env.WHOP_PLAN_3997,
      minPrice: 3001,
      maxPrice: 5000,
      name: '$3,997 Plan'
    },
    plan_9997: {
      id: process.env.WHOP_PLAN_9997,
      minPrice: 5001,
      maxPrice: 999999,
      name: '$9,997 Plan'
    }
  };
  
  for (const [key, plan] of Object.entries(plans)) {
    if (amountUSD >= plan.minPrice && amountUSD <= plan.maxPrice && plan.id) {
      return {
        planId: plan.id,
        planName: plan.name,
        planKey: key
      };
    }
  }
  
  // Fallback на самый дорогой план если цена выше всех
  return {
    planId: process.env.WHOP_PLAN_9997,
    planName: '$9,997 Plan',
    planKey: 'plan_9997'
  };
}

/**
 * Create Whop checkout from GetCourse order
 * GET/POST /api/create-checkout
 * 
 * Expected parameters from GetCourse:
 * - deal_number: Order number (ВАЖНО! Только из GetCourse процесса)
 * - user_email: User email
 * - user_phone: User phone
 * - user_name: User name
 * - deal_cost: Order amount (в USD)
 * - offer_title: Offer title
 * - callback_secret: Security token (optional)
 * 
 * Система выбирает план Whop автоматически по стоимости заказа
 */
router.all('/create-checkout', async (req, res) => {
  try {
    // Get parameters from both GET and POST
    const params = { ...req.query, ...req.body };
    
    console.log('[CREATE-CHECKOUT] Received request:', {
      deal_number: params.deal_number,
      user_email: params.user_email,
      user_phone: params.user_phone,
      deal_cost: params.deal_cost
    });
    
    // Validate required parameters
    if (!params.deal_number || !params.user_email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        required: ['deal_number', 'user_email']
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
    
    // Parse deal cost (remove currency symbols, convert to float USD)
    const dealCostUSD = params.deal_cost ? parseFloat(params.deal_cost.toString().replace(/[^0-9.]/g, '')) : 0;
    const dealCostCents = Math.round(dealCostUSD * 100);
    
    // Выбираем план Whop по стоимости заказа
    const selectedPlan = selectWhopPlanByPrice(dealCostUSD);
    
    console.log('[CREATE-CHECKOUT] Plan selected:', {
      orderAmount: dealCostUSD,
      selectedPlan: selectedPlan.planName,
      planId: selectedPlan.planId
    });
    
    // Create session ID (уникальный для этого заказа)
    const sessionId = `sess_${params.deal_number}_${Date.now()}`;
    
    // Сохраняем данные клиента в памяти сервера
    pendingCheckouts.set(sessionId, {
      dealNumber: params.deal_number,
      userName: params.user_name || '',
      userEmail: params.user_email,
      userPhone: params.user_phone || '',
      amount: dealCostCents,
      amountUSD: dealCostUSD,
      offerTitle: params.offer_title || 'Order',
      selectedPlan: selectedPlan.planName,
      selectedPlanId: selectedPlan.planId,
      checkoutUrl: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 20 * 60 * 1000) // 20 минут
    });
    
    console.log('[CREATE-CHECKOUT] Session created:', sessionId);
    
    // Create checkout configuration in Whop
    const whopResponse = await createWhopCheckout({
      dealNumber: params.deal_number,
      userEmail: params.user_email,
      userName: params.user_name || '',
      amount: dealCostUSD,
      amountCents: dealCostCents,
      offerId: params.offer_id || '',
      offerTitle: params.offer_title || 'Order',
      planId: selectedPlan.planId,
      planName: selectedPlan.planName
    });
    
    if (!whopResponse.success) {
      pendingCheckouts.delete(sessionId);
      throw new Error(whopResponse.error || 'Failed to create Whop checkout');
    }
    
    // Сохраняем checkout URL в сессию
    pendingCheckouts.get(sessionId).checkoutUrl = whopResponse.checkoutUrl;
    
    console.log('[CREATE-CHECKOUT] Whop checkout created for session:', sessionId);
    
    // Возвращаем редирект на страницу-прокладку с параметрами
    // GetCourse перенаправит клиента туда со всеми данными
    const baseUrl = process.env.BASE_URL || 'https://getcourse-whop-integration.onrender.com';
    const redirectUrl = `${baseUrl}/api/waiting-page/${sessionId}?name=${encodeURIComponent(params.user_name || '')}&email=${encodeURIComponent(params.user_email)}&phone=${encodeURIComponent(params.user_phone || '')}&deal_number=${encodeURIComponent(params.deal_number)}`;
    
    res.json({
      success: true,
      redirect_url: redirectUrl,
      session_id: sessionId,
      plan_selected: selectedPlan.planName
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
 * Используется выбранный ранее план
 */
async function createWhopCheckout(data) {
  try {
    console.log('[WHOP-API] Creating checkout with plan:', {
      planId: data.planId,
      planName: data.planName,
      dealNumber: data.dealNumber
    });
    
    const response = await axios.post(
      'https://api.whop.com/v1/checkout_configurations',
      {
        plan: {
          // Используем существующий план из Whop вместо создания нового
          id: data.planId
        },
        metadata: {
          deal_number: data.dealNumber,
          user_email: data.userEmail,
          user_name: data.userName,
          offer_id: data.offerId,
          offer_title: data.offerTitle,
          source: 'getcourse',
          order_amount: data.amount,
          plan_name: data.planName
        },
        redirect_url: process.env.SUCCESS_REDIRECT_URL || 'https://getcourse.ru/success',
        cancel_url: process.env.CANCEL_REDIRECT_URL || 'https://getcourse.ru/cancel'
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHOP_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    const checkoutConfig = response.data;
    const planId = checkoutConfig.plan?.id || data.planId;
    const checkoutConfigId = checkoutConfig.id;
    
    // Generate checkout URL
    const checkoutUrl = `https://whop.com/checkout/${planId}?checkout_config=${checkoutConfigId}`;
    
    console.log('[WHOP-API] Checkout created:', { 
      planId, 
      checkoutConfigId,
      planName: data.planName 
    });
    
    return {
      success: true,
      checkoutUrl,
      planId,
      checkoutConfigId,
      planName: data.planName
    };
    
  } catch (error) {
    console.error('[WHOP-API] Error creating checkout:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

module.exports = router;
module.exports.pendingCheckouts = pendingCheckouts;
module.exports.selectWhopPlanByPrice = selectWhopPlanByPrice;
