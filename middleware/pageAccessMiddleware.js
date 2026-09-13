// Middleware to check if user has access to a specific page
const checkPageAccess = (pageName) => {
  return (req, res, next) => {
    const user = req.user;

    // Super Admin always has access
    if (user.role === 'super_admin') return next();

    // For Site Admin/Mess Keeper, check page permission
    if (user.role === 'site_admin' || user.role === 'mess_keeper') {
      if (!user.permissions?.pages?.[pageName]) {
        return res.status(403).json({ 
          message: `Access denied: You don't have permission to access ${pageName}` 
        });
      }
      return next();
    }

    // Employees have no access to admin pages
    return res.status(403).json({ message: 'Access denied' });
  };
};

// Middleware to check if user can export data
const checkExportAccess = (req, res, next) => {
  const user = req.user;
  if (user.role === 'super_admin') return next();
  if (!user.permissions?.exportData) {
    return res.status(403).json({ message: 'Access denied: Export not allowed' });
  }
  next();
};

module.exports = { checkPageAccess, checkExportAccess };