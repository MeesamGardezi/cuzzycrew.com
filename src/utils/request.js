'use strict';

const net = require('net');

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};

  return header.split(';').reduce((acc, part) => {
    const index = part.indexOf('=');
    if (index === -1) return acc;
    const key = part.slice(0, index).trim();
    const value = decodeURIComponent(part.slice(index + 1).trim());
    acc[key] = value;
    return acc;
  }, {});
}

function normalizeIp(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

function isPrivateIpv4(ip) {
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip === '0.0.0.0') return true;
  const parts = ip.split('.').map(Number);
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

function isPrivateIpv6(ip) {
  return ip === '::1' || ip === '::' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:');
}

function isPrivateIp(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized || net.isIP(normalized) === 0) return true;
  return net.isIP(normalized) === 4 ? isPrivateIpv4(normalized) : isPrivateIpv6(normalized.toLowerCase());
}

function getClientIp(req) {
  return normalizeIp(req.ip || req.socket?.remoteAddress || '');
}

function getUserAgent(req) {
  return String(req.get('user-agent') || '').slice(0, 400);
}

module.exports = {
  getClientIp,
  getUserAgent,
  isPrivateIp,
  normalizeIp,
  parseCookies,
};
