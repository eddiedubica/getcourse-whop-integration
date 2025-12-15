const express = require('express');
const router = express.Router();
const axios = require('axios');
const { saveCheckout } = require('./checkoutStatus');

/**
 * Выбор плана Whop по стоимости заказа
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
  
  return {
    planId: process.env.WHOP_PLAN_9997,
    planName: '$9,997 Plan',
    planKey: 'plan_9997'
  };
}

/**
 * Создание checkout в Whop
 * POST /api/create-checkout
 * 
 * Параметры:
 * - deal_number: номер заказа (требуется)
 * - user_email: email (требуется)
 * - user_phone: телефон (опционально)
 * - user_name: имя (опционально)
 * - deal_cost: сумма (требуется)
 * - offer_title: название товара (опционально)
 */
router.all('/create-checkout', async (req, res) => {
  try {
    const params = { ...req.query, ...req.body };
    
    console.log('[CREATE-CHECKOUT] Request:', {
      deal_number: params.deal_number,
      deal_cost: params.deal_cost,
      user_email: params.user_email
    });
    
    // Валидация
    if (!params.deal_number || !params.user_email || !params.deal_cost) {
      return res.status(400).json({
        success: false,
        error: 'Missing: deal_number, user_email, deal_cost'
      });
    }
    
    // Парсим сумму
    const dealCostUSD = parseFloat(params.deal_cost.toString().replace(/[^0-9.]/g, '')) || 0;
    
    // Выбираем план
    const selectedPlan = selectWhopPlanByPrice(dealCostUSD);
    
    console.log('[CREATE-CHECKOUT] Selected plan:', selectedPlan.planName, 'for amount:', dealCostUSD);
    
    // Создаём checkout в Whop
    const whopResponse = await createWhopCheckout({
      dealNumber: params.deal_number,
      userEmail: params.user_email,
      userName: params.user_name || '',
      amount: dealCostUSD,
      offerTitle: params.offer_title || 'Order',
      planId: selectedPlan.planId
    });
    
    if (!whopResponse.success) {
      throw new Error(whopResponse.error);
    }
    
    // Сохраняем по deal_number для polling
    saveCheckout(params.deal_number, {
      amount: dealCostUSD,
      offerTitle: params.offer_title || 'Order',
      planName: selectedPlan.planName,
      checkoutUrl: whopResponse.checkoutUrl
    });
    
    console.log('[CREATE-CHECKOUT] Saved for polling, deal:', params.deal_number);
    
    // Просто успех - GetCourse процесс больше ничего не ждёт
    res.json({
      success: true,
      message: 'Checkout created, check /api/checkout-status/:dealNumber'
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
 * Создание checkout в Whop API
 */
async function createWhopCheckout(data) {
  try {
    const response = await axios.post(
      'https://api.whop.com/v1/checkout_configurations',
      {
        plan: {
          id: data.planId
        },
        metadata: {
          deal_number: data.dealNumber,
          user_email: data.userEmail,
          user_name: data.userName,
          offer_title: data.offerTitle,
          source: 'getcourse'
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
    const checkoutUrl = `https://whop.com/checkout/${planId}?checkout_config=${checkoutConfigId}`;
    
    console.log('[WHOP-API] Checkout created for deal:', data.dealNumber);
    
    return {
      success: true,
      checkoutUrl,
      planId,
      checkoutConfigId
    };
    
  } catch (error) {
    console.error('[WHOP-API] Error:', error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

module.exports = router;
