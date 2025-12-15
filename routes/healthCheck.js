const express = require('express');
const router = express.Router();

/**
 * Health check endpoint
 * GET /api/health
 */
router.get('/health', (req, res) => {
  const healthcheck = {
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'getcourse-whop-integration',
    version: '1.0.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    },
    checklist: {
      getcourse_api_key: !!process.env.GETCOURSE_API_KEY,
      getcourse_account: !!process.env.GETCOURSE_ACCOUNT_NAME,
      whop_api_key: !!process.env.WHOP_API_KEY,
      whop_company_id: !!process.env.WHOP_COMPANY_ID,
      whop_webhook_secret: !!process.env.WHOP_WEBHOOK_SECRET,
      redirect_urls: {
        success: !!process.env.SUCCESS_REDIRECT_URL,
        cancel: !!process.env.CANCEL_REDIRECT_URL
      }
    }
  };
  
  res.json(healthcheck);
});

module.exports = router;
