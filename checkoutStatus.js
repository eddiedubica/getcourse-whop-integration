const express = require('express');
const router = express.Router();

// Временное хранилище заказов (в memory, по deal_number)
const checkoutsByDealNumber = new Map();

/**
 * Polling API - получить данные заказа и ссылку на Whop по номеру заказа
 * GET /api/checkout-status/:dealNumber
 * 
 * Клиент polling-ит каждые 500мс пока не получит checkout_url
 */
router.get('/checkout-status/:dealNumber', (req, res) => {
  const { dealNumber } = req.params;
  
  console.log('[CHECKOUT-STATUS] Polling for deal:', dealNumber);
  
  const checkout = checkoutsByDealNumber.get(dealNumber);
  
  if (!checkout) {
    // Ещё не создан
    console.log('[CHECKOUT-STATUS] Checkout not found yet for deal:', dealNumber);
    return res.json({
      success: true,
      ready: false,
      message: 'Waiting for order confirmation...'
    });
  }
  
  // Проверяем, не истекло ли время
  if (new Date() > checkout.expiresAt) {
    checkoutsByDealNumber.delete(dealNumber);
    console.error('[CHECKOUT-STATUS] Checkout expired for deal:', dealNumber);
    return res.json({
      success: false,
      ready: false,
      error: 'Checkout expired'
    });
  }
  
  // Если checkout готов
  if (checkout.checkoutUrl) {
    console.log('[CHECKOUT-STATUS] Checkout ready for deal:', dealNumber);
    return res.json({
      success: true,
      ready: true,
      deal_number: checkout.dealNumber,
      deal_cost: checkout.amount,
      offer_title: checkout.offerTitle,
      plan_name: checkout.planName,
      checkout_url: checkout.checkoutUrl
    });
  }
  
  // Ещё готовится
  console.log('[CHECKOUT-STATUS] Checkout preparing for deal:', dealNumber);
  res.json({
    success: true,
    ready: false,
    message: 'Preparing payment link...',
    deal_number: checkout.dealNumber,
    deal_cost: checkout.amount,
    offer_title: checkout.offerTitle
  });
});

/**
 * Функция для сохранения checkout по deal_number
 * Вызывается из createCheckout.js
 */
function saveCheckout(dealNumber, checkoutData) {
  checkoutsByDealNumber.set(dealNumber, {
    dealNumber: dealNumber,
    amount: checkoutData.amount,
    offerTitle: checkoutData.offerTitle,
    planName: checkoutData.planName,
    checkoutUrl: checkoutData.checkoutUrl,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 20 * 60 * 1000) // 20 минут
  });
  
  console.log('[CHECKOUT-STORAGE] Saved checkout for deal:', dealNumber);
}

/**
 * Очистка старых checkouts
 */
function cleanupExpiredCheckouts() {
  const now = new Date();
  let cleaned = 0;
  
  for (const [dealNumber, checkout] of checkoutsByDealNumber.entries()) {
    if (now > checkout.expiresAt) {
      checkoutsByDealNumber.delete(dealNumber);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log('[CHECKOUT-STORAGE] Cleaned up', cleaned, 'expired checkouts');
  }
}

// Запуск очистки каждые 10 минут
setInterval(cleanupExpiredCheckouts, 10 * 60 * 1000);

module.exports = router;
module.exports.saveCheckout = saveCheckout;
module.exports.checkoutsByDealNumber = checkoutsByDealNumber;
