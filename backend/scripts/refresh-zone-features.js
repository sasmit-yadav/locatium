require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { refreshMaterializedView } = require('../src/services/zone-features-cache.service');

refreshMaterializedView()
  .then((result) => {
    console.log('zone_features refreshed:', result);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
