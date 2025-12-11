const axios = require('axios');

class GetCourseAPI {
  constructor(accountName, apiKey) {
    this.accountName = accountName;
    this.apiKey = apiKey;
    this.baseUrl = `https://${accountName}.getcourse.ru/pl/api`;
  }

  /**
   * Create or update a deal (order) in GetCourse
   */
  async updateDeal(dealData) {
    try {
      const params = Buffer.from(JSON.stringify(dealData)).toString('base64');
      
      const response = await axios.post(
        `${this.baseUrl}/deals`,
        null,
        {
          params: {
            action: 'add',
            key: this.apiKey,
            params: params
          }
        }
      );
      
      return {
        success: response.data.success !== false,
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
   * Update deal status
   */
  async updateDealStatus(dealNumber, userEmail, status) {
    const dealData = {
      user: {
        email: userEmail
      },
      deal: {
        deal_number: dealNumber,
        deal_status: status
      }
    };
    
    return await this.updateDeal(dealData);
  }

  /**
   * Add payment information to deal
   */
  async addPaymentToDeal(dealNumber, userEmail, paymentInfo) {
    const dealData = {
      user: {
        email: userEmail
      },
      deal: {
        deal_number: dealNumber,
        deal_status: 'payed'
      },
      payment: {
        payment_id: paymentInfo.paymentId,
        payment_amount: paymentInfo.amount,
        payment_status: 'accepted',
        payment_type: paymentInfo.paymentType || 'CARD',
        payment_date: paymentInfo.date || new Date().toISOString()
      }
    };
    
    return await this.updateDeal(dealData);
  }

  /**
   * Export deals
   */
  async exportDeals(filters = {}) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/deals`,
        {
          params: {
            key: this.apiKey,
            ...filters
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
}

module.exports = GetCourseAPI;
