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

async function demo(req, res) {
  const result = await authService.loginDemo();
  await auditService.writeAuditFromRequest(req, {
    userId: result.user.id,
    action: 'auth.demo',
    resourceType: 'user',
    resourceId: result.user.id,
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

async function updateProfile(req, res) {
  const profileData = await authService.updateProfile(req.user.id, {
    displayName: req.body?.displayName ?? req.body?.display_name,
  });
  await auditService.writeAuditFromRequest(req, {
    userId: req.user.id,
    action: 'auth.profile_update',
    resourceType: 'user',
    resourceId: req.user.id,
  });
  res.json(profileData);
}

module.exports = {
  register,
  login,
  demo,
  refresh,
  logout,
  profile,
  updateProfile,
};
