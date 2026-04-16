'use strict';

const CONTACT_STATUS_VALUES = ['new', 'in_review', 'contacted', 'won', 'lost', 'spam', 'archived'];

function stripControlChars(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
}

function normalizeEmail(value) {
  return stripControlChars(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function normalizeText(value, max = 255) {
  return stripControlChars(value).replace(/\s+/g, ' ').slice(0, max).trim();
}

function normalizeMultilineText(value, max = 4000) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, max)
    .trim();
}

function validateContactPayload(payload) {
  const brand = normalizeText(payload.brand, 120);
  const email = normalizeEmail(payload.email);
  const packageInterest = normalizeText(payload.package || payload.packageInterest, 120);
  const message = normalizeMultilineText(payload.message, 4000);

  if (!brand || !email || !message) {
    return { ok: false, error: 'Please fill in all required fields.' };
  }

  if (!isValidEmail(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }

  if (message.length < 10) {
    return { ok: false, error: 'Please share a few more details about the campaign.' };
  }

  return {
    ok: true,
    value: { brand, email, packageInterest, message },
  };
}

function validateJoinPayload(payload) {
  const email = normalizeEmail(payload.email);
  if (!email || !isValidEmail(email)) {
    return { ok: false, error: 'Valid email address required.' };
  }

  return { ok: true, value: { email } };
}

function normalizeStatus(value) {
  const normalized = normalizeText(value, 20).toLowerCase();
  return CONTACT_STATUS_VALUES.includes(normalized) ? normalized : 'new';
}

function normalizeTags(tags) {
  const input = Array.isArray(tags) ? tags : String(tags || '').split(',');
  return Array.from(new Set(input
    .map((tag) => normalizeText(tag, 24).toLowerCase())
    .filter(Boolean)))
    .slice(0, 8);
}

module.exports = {
  CONTACT_STATUS_VALUES,
  isValidEmail,
  normalizeEmail,
  normalizeMultilineText,
  normalizeStatus,
  normalizeTags,
  normalizeText,
  validateContactPayload,
  validateJoinPayload,
};
