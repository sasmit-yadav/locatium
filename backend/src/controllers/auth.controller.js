const authService = require('../services/auth.service');
const auditService = require('../services/audit.service');

async function register(req, res) {
  const result = await authService.register(req.body || {});
  await auditService.writeAuditFromRequest(req, {
    userId: result.user.id,
    action: 'auth.register',
    resourceType: 'user',
    resourceId: result.user.id,
    metadata: { email: result.user.email },
  });
  res.status(201).json(result);
}

async function login(req, res) {
  const result = await authService.login(req.body || {});
  await auditService.writeAuditFromRequest(req, {
    userId: result.user.id,
    action: 'auth.login',
    resourceType: 'user',
    resourceId: result.user.id,
    metadata: { email: result.user.email },
  });
  res.json(result);
}

async function refresh(req, res) {
  const result = await authService.refresh(req.body || {});
  res.json(result);
}

async function logout(req, res) {
  const result = await authService.logout(req.body || {});
  res.json(result);
}

async function profile(req, res) {
  const profileData = await authService.getProfile(req.user.id);
  res.json(profileData);
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  profile,
};
