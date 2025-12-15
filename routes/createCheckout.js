async function createWhopCheckout(data) {
  try {
    // Используем существующий Plan ID вместо создания нового
    const response = await axios.post(
      'https://api.whop.com/v2/checkout_sessions',
      {
        plan_id: process.env.WHOP_PLAN_ID || 'plan_SGVT1cWHcicSo',
        metadata: {
          deal_number: data.dealNumber,
          user_email: data.userEmail,
          user_name: data.userName,
          offer_id: data.offerId,
          offer_title: data.offerTitle,
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
    const checkoutUrl = session.checkout_url || session.url;
    
    return {
      success: true,
      checkoutUrl: checkoutUrl,
      planId: process.env.WHOP_PLAN_ID,
      checkoutConfigId: session.id
    };
    
  } catch (error) {
    console.error('[WHOP-API] Error creating checkout:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}
```

---

## 🔐 Добавьте переменную окружения на Render.com:

1. Зайдите в **Render.com** → ваш сервис
2. **Environment** → добавьте:
   - `WHOP_PLAN_ID` = `plan_SGVT1cWHcicSo`

---

## 📝 Полный список переменных окружения:
```
WHOP_API_KEY=apik_piai2PPs5yK8B_C3885061_C_622bc7f4d3223de880c232fbbb95b901127b7960c64d71879c231125fc4b54
WHOP_PLAN_ID=plan_SGVT1cWHcicSo
GETCOURSE_API_KEY=VFZOfFNO6laPdjOtlAqc86tLxsdN7xPT3FVG2i5vE2t7WFdJnJDdceLpBGZKMW5thEKZIg8zZ6zCeayGukA2njKn8m4B7zm8P5tKmKiBAqXaLtpSAuCn7Sp728Ghne66
SUCCESS_REDIRECT_URL=https://course.coral-santoro.com/success
CANCEL_REDIRECT_URL=https://course.coral-santoro.com/cancel
