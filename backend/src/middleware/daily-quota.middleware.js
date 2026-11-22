const usageQuota = require('../services/usage-quota.service');

const MESSAGES = {
  assistant: {
    en: "You've used today's Ask LOCATIUM questions. The map, plot check and reports still work — the assistant resets at midnight.",
    hi: 'आज के Ask LOCATIUM सवाल पूरे हो गए। नक्शा, प्लॉट जाँच और रिपोर्ट अब भी काम करते हैं — सहायक आधी रात को फिर शुरू होगा।',
  },
};

/**
 * Counts one use of a costly action per request and answers 429 with a friendly,
 * bilingual message once the user's daily limit is reached. Call after `authenticate`.
 */
function dailyQuota(kind) {
  return async (req, res, next) => {
    try {
      const usage = await usageQuota.consume(kind, req.user, {
        message: MESSAGES[kind]?.en,
        blockedMessage: MESSAGES[kind]?.en,
      });
      if (Number.isFinite(usage.limit)) {
        res.setHeader('X-Daily-Limit', String(usage.limit));
        res.setHeader('X-Daily-Remaining', String(usage.remaining));
      }
      next();
    } catch (err) {
      if (err.statusCode === 429 || err.statusCode === 403) {
        res.status(err.statusCode).json({
          error: MESSAGES[kind]?.en || err.message,
          errorHi: MESSAGES[kind]?.hi,
          code: err.details?.code || 'DAILY_LIMIT',
          limit: err.details?.limit,
        });
        return;
      }
      next(err);
    }
  };
}

module.exports = { dailyQuota };
