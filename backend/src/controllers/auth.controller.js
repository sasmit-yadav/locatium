const authService = require('../services/auth.service');
const auditService = require('../services/audit.service');

async function register(req, res) {
  const result = await authService.register(req.body || {}, { currentUser: req.user });
  await auditService.writeAuditFromRequest(req, {
    userId: result.user.id,
    action: 'auth.register',
    resourceType: 'user',
    resourceId: result.user.id,
    metadata: { upgradedFromDemo: result.upgradedFromDemo },
  });
  res.status(201).json(result);
}

async function config(_req, res) {
  res.json({
    registrationOpen: authService.registrationOpen(),
    demoMode: process.env.DEMO_MODE === 'true',
  });
}

async function verifyEmail(req, res) {
  const result = await authService.verifyEmail(req.body || {});
  await auditService.writeAuditFromRequest(req, {
    userId: result.user.id,
    action: 'auth.email_verified',
    resourceType: 'user',
    resourceId: result.user.id,
  });
  res.json(result);
}

async function resendVerification(req, res) {
  res.json(await authService.resendVerification(req.user.id));
}

async function forgotPassword(req, res) {
  res.json(await authService.forgotPassword(req.body || {}));
}

async function resetPassword(req, res) {
  const result = await authService.resetPassword(req.body || {});
  await auditService.writeAuditFromRequest(req, {
    action: 'auth.password_reset',
    resourceType: 'user',
  });
  res.json(result);
}

async function changePassword(req, res) {
  const result = await authService.changePassword(req.user.id, req.body || {});
  await auditService.writeAuditFromRequest(req, {
    userId: req.user.id,
    action: 'auth.password_changed',
    resourceType: 'user',
    resourceId: req.user.id,
  });
  res.json(result);
}

async function deleteAccount(req, res) {
  const result = await authService.deleteAccount(req.user.id, req.body || {});
  // The user row is gone; keep an anonymous trace that a deletion happened.
  req.user = undefined;
  await auditService.writeAuditFromRequest(req, {
    action: 'auth.account_deleted',
    resourceType: 'user',
  });
  res.json(result);
}

async function login(req, res) {
  const result = await authService.login(req.body || {});
  await auditService.writeAuditFromRequest(req, {
    userId: result.user.id,
    action: 'auth.login',
    resourceType: 'user',
    resourceId: result.user.id,
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
  config,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  deleteAccount,
  login,
  demo,
  refresh,
  logout,
  profile,
  updateProfile,
};
