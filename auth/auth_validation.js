function checkSession(req, res, next) {
  if (req.session.user) return next();
  return res.status(401).json({ success: 0, message: 'Please sign in to continue.' });
}

function requireAdmin(req, res, next) {
  if (['Superadmin', 'Administrator'].includes(req.session.user?.role)) return next();
  return res.status(403).json({ success: 0, message: 'Administrator access is required.' });
}

function requireSuperadmin(req, res, next) {
  if (req.session.user?.role === 'Superadmin') return next();
  return res.status(403).json({ success: 0, message: 'Superadmin access is required.' });
}

module.exports = { checkSession, requireAdmin, requireSuperadmin };
