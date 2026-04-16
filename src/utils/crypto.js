'use strict';

const crypto = require('crypto');

function hashValue(value, secret) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

function signValue(value, secret) {
  return hashValue(value, secret);
}

function safeCompare(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function randomToken(size = 24) {
  return crypto.randomBytes(size).toString('hex');
}

module.exports = {
  hashValue,
  randomToken,
  safeCompare,
  signValue,
};
