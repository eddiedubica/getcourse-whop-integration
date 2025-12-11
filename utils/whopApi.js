const axios = require('axios');

class WhopAPI {
  constructor(apiKey, companyId) {
    this.apiKey = apiKey;
    this.companyId = companyId;
    this.baseUrl = 'https://api.whop.com/v1';
  }

  /**
   * Create a checkout configuration
   */
  async createCheckoutConfiguration(options ) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/checkout_configurations`,
        {
          plan: {
            company_id: this.companyId,
            initial_price: options.amount,
            plan_type: options.planType || 'one_time',
            release_method: 'buy_now',
            currency: 'USD' // <-- ИСПРАВЛЕНО: Добавлена валюта USD
          },
          metadata: options.metadata || {},
          redirect_url: options.redirectUrl,
          // cancel_url: options.cancelUrl // <-- ИСПРАВЛЕНО: Удалено лишнее поле
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Generate checkout URL from configuration
   */
  generateCheckoutUrl(planId, checkoutConfigId) {
    return `https://whop.com/checkout/${planId}?checkout_config=${checkoutConfigId}`;
  }

  /**
   * Get payment details
   */
  async getPayment(paymentId ) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/payments/${paymentId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Create a plan
   */
  async createPlan(planData) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/plans`,
        {
          company_id: this.companyId,
          ...planData
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * List payments
   */
  async listPayments(filters = {}) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/payments`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          params: filters
        }
      );
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }
}

module.exports = WhopAPI;
