const express = require('express');
const router = express.Router();
const WhopAPI = require('../utils/whopApi');
const GetCourseAPI = require('../utils/getcourseApi');

// Initialize APIs (assuming environment variables are set)
const whopApi = new WhopAPI(process.env.WHOP_API_KEY, process.env.WHOP_COMPANY_ID);
const getcourseApi = new GetCourseAPI(process.env.GETCOURSE_API_KEY, process.env.GETCOURSE_DOMAIN);

router.get('/', async (req, res) => {
    const { deal_number, user_email, deal_cost, user_name, offer_title } = req.query;

    // 1. Basic validation
    if (!deal_number || !user_email || !deal_cost) {
        console.error('[CREATE-CHECKOUT] Missing required parameters');
        return res.status(400).json({ success: false, error: 'Missing required parameters', required: ['deal_number', 'user_email', 'deal_cost'] });
    }

    console.log('[CREATE-CHECKOUT] Received request: ', { deal_number, user_email, deal_cost, user_name, offer_title });

    try {
        // 2. Create Whop Checkout Configuration
        const checkoutResult = await whopApi.createCheckoutConfiguration({
            amount: deal_cost,
            planType: 'one_time',
            redirectUrl: `${process.env.RENDER_EXTERNAL_URL}/api/whop-webhook`, // Success URL
            cancelUrl: `${process.env.RENDER_EXTERNAL_URL}/api/whop-webhook`, // Cancel URL
            metadata: {
                deal_number,
                user_email,
                user_name,
                offer_title
            }
        });

        if (!checkoutResult.success) {
            console.error('[WHOP-API] Error creating checkout: ', checkoutResult.error);
            // 3. Update GetCourse with error (optional, but good practice)
            // await getcourseApi.updateOrder(deal_number, { comment: `Ошибка Whop: ${JSON.stringify(checkoutResult.error)}` });
            return res.status(400).json({ success: false, error: checkoutResult.error });
        }

        const { plan_id, checkout_config_id } = checkoutResult.data;

        // 4. Generate Checkout URL
        const checkoutUrl = whopApi.generateCheckoutUrl(plan_id, checkout_config_id);

        // 5. Update GetCourse Order with Checkout URL
        const updateResult = await getcourseApi.updateOrder(deal_number, {
            whop_checkout_url: checkoutUrl,
            comment: `Ссылка Whop создана: ${checkoutUrl}`
        });

        if (!updateResult.success) {
            console.error('[GETCOURSE-API] Error updating order: ', updateResult.error);
            return res.status(500).json({ success: false, error: 'Checkout created, but failed to update GetCourse order.' });
        }

        console.log('[CREATE-CHECKOUT] Success. Checkout URL: ', checkoutUrl);
        
        // 6. Respond to GetCourse
        return res.json({ success: true, checkout_url: checkoutUrl });

    } catch (error) {
        console.error('[CREATE-CHECKOUT] Internal Server Error: ', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

module.exports = router;
