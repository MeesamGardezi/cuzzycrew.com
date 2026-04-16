'use strict';

function toIsoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function addMinutes(value, minutes) {
  return new Date(new Date(value).getTime() + (minutes * 60 * 1000));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

module.exports = {
  addMinutes,
  clamp,
  nowIso,
  toIsoDate,
};
