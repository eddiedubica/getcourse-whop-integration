const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Временная база для хранения checkout_url
 * В продакшене лучше Redis или MongoDB
 */
const checkoutDB = {}; // { email: checkout_url }

/**
 * Create Whop checkout from GetCourse order
 */
router.all('/create-checkout', async (req, res) => {
    try {
        const params = { ...req.query, ...req.body };
        console.log('[CREATE-CHECKOUT] Received request:', params);

        if (!params.user_email) return res.status(400).json({ success: false, error: 'Missing user_email' });

        // Дефолтные значения
        const deal_number = params.deal_number || 'ORDER_' + Date.now();
        const deal_cost = params.deal_cost || '997';
        const offer_title = params.offer_title || 'Default Plan';
        const user_name = params.user_name || 'Customer';

        // Создаём Whop checkout
        const whopResponse = await createWhopCheckout({
            dealNumber: deal_number,
            dealCost: deal_cost,
            offerTitle: offer_title,
            userEmail: params.user_email,
            userName: user_name,
            userPhone: params.user_phone,
            currency: params.currency || 'USD'
        });

        if (!whopResponse.success) throw new Error(whopResponse.error || 'Failed to create Whop checkout');

        checkoutDB[params.user_email] = whopResponse.checkoutUrl;

        res.json({ success: true, checkout_url: whopResponse.checkoutUrl });

    } catch (err) {
        console.error('[CREATE-CHECKOUT] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET checkout_url by email
 */
router.get('/get-checkout', (req, res) => {
    const email = req.query.email;
    if (!email) return res.status(400).json({ status: 'error', error: 'Email required' });

    const url = checkoutDB[email];
    if (!url) return res.json({ status: 'pending' });

    res.json({ status: 'ok', checkout_url: url });
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
 * Create Whop checkout session via API v2
 */
async function createWhopCheckout(data) {
    try {
        const planId = selectPlanByPrice(data.dealCost);
        console.log(`[WHOP-API] Selected plan ${planId} for price ${data.dealCost}`);

        const response = await axios.post('https://api.whop.com/v2/checkout_sessions', {
            plan_id: planId,
            metadata: {
                deal_number: data.dealNumber,
                deal_cost: data.dealCost,
                offer_title: data.offerTitle,
                user_email: data.userEmail,
                user_name: data.userName,
                user_phone: data.userPhone,
                currency: data.currency,
                source: 'getcourse'
            }
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.WHOP_API_KEY}`,
                'Content-Type': 'application/json'
            }
        } );

        const session = response.data;
        const checkoutUrl = session.purchase_url || session.checkout_url || session.url;
        if (!checkoutUrl) throw new Error('No checkout URL returned from Whop');

        return { success: true, checkoutUrl, sessionId: session.id };

    } catch (err) {
        console.error('[WHOP-API] Error:', err.message, err.response?.data);
        return { success: false, error: err.response?.data?.message || err.message };
    }
}

/**
 * Whop webhook
 */
router.post('/whop-webhook', async (req, res) => {
    try {
        const event = req.body;
        if (event.type === 'payment.succeeded' || event.type === 'checkout.completed') {
            const metadata = event.data?.metadata || {};
            const dealNumber = metadata.deal_number;
            const userEmail = metadata.user_email;
            if (dealNumber && userEmail) {
                console.log(`[WHOP-WEBHOOK] Payment succeeded for ${dealNumber}`);
                await updateGetCourseOrderStatus(dealNumber, userEmail, 'payed');
            }
        }
        res.json({ received: true });
    } catch (err) {
        console.error('[WHOP-WEBHOOK] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Update GetCourse order status
 */
async function updateGetCourseOrderStatus(dealNumber, userEmail, status) {
    try {
        if (!process.env.GETCOURSE_API_KEY) return;
        const params = { user: { email: userEmail }, deal: { deal_number: dealNumber, deal_status: status } };
        const paramsBase64 = Buffer.from(JSON.stringify(params)).toString('base64');
        await axios.post(`https://${process.env.GETCOURSE_ACCOUNT || 'course.coral-santoro'}.com/pl/api/deals`,
            new URLSearchParams({ action: 'add', key: process.env.GETCOURSE_API_KEY, params: paramsBase64 } ),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        console.log('[GETCOURSE-API] Order status updated');
    } catch (err) { console.error('[GETCOURSE-API] Error:', err.message); }
}

module.exports = router;
