'use strict';
const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  // Bypass authentication and use a default user
  req.user = { id: 1, username: 'Local User', email: 'local@example.com' };
  next();
}

module.exports = authenticate;
