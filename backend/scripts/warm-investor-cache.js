require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { warmInvestorCache } = require('../src/services/investor-cache-warm.service');

warmInvestorCache()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success === result.queries ? 0 : 1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
