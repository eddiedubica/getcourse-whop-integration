const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

/**

* Receive webhook from Whop when payment is successful
* POST /api/whop-webhook
  */
  router.post('/whop-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
  const signature = req.headers['webhook-signature'];
  const timestamp = req.headers['webhook-timestamp'];
  const webhookId = req.headers['webhook-id'];

  const rawBody = req.body.toString('utf8');
  const event = JSON.parse(rawBody);

  if (process.env.WHOP_WEBHOOK_SECRET) {
  const isValid = verifyWhopWebhook(signature, timestamp, webhookId, rawBody);
  if (!isValid) {
  console.error('[WHOP-WEBHOOK] Invalid signature');
  return res.status(401).json({ success: false, error: 'Invalid signature' });
  }
  }

  if (event.type === 'payment.succeeded') {
  const paymentData = event.data;
  const metadata = paymentData.metadata || {};
  const dealNumber = metadata.deal_number;
  const userEmail = metadata.user_email;

  if (dealNumber && userEmail) {
  console.log(`[WHOP-WEBHOOK] Payment succeeded for ${dealNumber}`);
  await updateGetCourseOrder(dealNumber, userEmail, 'payed');
  }
  }

  res.status(200).json({ success: true, received: true });

} catch (err) {
console.error('[WHOP-WEBHOOK] Error:', err.message);
res.status(200).json({ success: false, error: err.message });
}
});

function verifyWhopWebhook(signature, timestamp, webhookId, body) {
try {
if (!signature || !timestamp) return false;
const secret = Buffer.from(process.env.WHOP_WEBHOOK_SECRET, 'base64');
const signedContent = `${webhookId}.${timestamp}.${body}`;
const expectedSignature = crypto.createHmac('sha256', secret).update(signedContent).digest('base64');

```
const signatures = signature.split(',');
return signatures.some(sig => sig.trim() === `v1=${expectedSignature}`);
```

} catch {
return false;
}
}

async function updateGetCourseOrder(dealNumber, userEmail, status) {
try {
const accountName = process.env.GETCOURSE_ACCOUNT;
const apiKey = process.env.GETCOURSE_API_KEY;
const orderData = {
user: { email: userEmail },
deal: { deal_number: dealNumber, deal_status: status }
};
const params = Buffer.from(JSON.stringify(orderData)).toString('base64');

```
const response = await axios.post(
  `https://${accountName}.getcourse.ru/pl/api/deals`,
  null,
  { params: { action: 'add', key: apiKey, params } }
);

console.log('[GETCOURSE-API] Order updated:', response.data);
return response.data;
```

} catch (err) {
console.error('[GETCOURSE-API] Error:', err.response?.data || err.message);
return { success: false, error: err.message };
}
}

module.exports = router;
