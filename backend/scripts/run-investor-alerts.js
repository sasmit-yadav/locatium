require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { runAllAlerts } = require('../src/services/investor-alert.service');

runAllAlerts()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
