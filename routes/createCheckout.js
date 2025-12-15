function selectWhopPlanByPrice(amountUSD) {
  const plans = {
    plan_1: {
      id: process.env.WHOP_PLAN_1,
      minPrice: 0,
      maxPrice: 500,
      name: 'Plan 1'
    },
    plan_997: {
      id: process.env.WHOP_PLAN_997,
      minPrice: 501,
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
