'use strict';

function escapeCsvCell(value) {
  const normalized = String(value == null ? '' : value).replace(/\r\n/g, '\n');
  return `"${normalized.replace(/"/g, '""')}"`;
}

function toCsv(columns, rows) {
  const header = columns.map((column) => escapeCsvCell(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCsvCell(row[column.key])).join(',')).join('\n');
  return `${header}\n${body}`.trimEnd() + '\n';
}

module.exports = {
  toCsv,
};
