'use strict';

// Cosmetic replacements preserve the provenance of historical purchases and refunds.
// No payment rows or original grant IDs are rewritten or fabricated.
const replacements = Object.freeze({
  timur: 'crypto-monk', luna: 'wallstreet-pirate', felix: 'mayor',
  oscar: 'teen-investor', marcel: 'madam-franchise', ren: 'anonymous-hacker',
});
const canonicalItem = item => item.startsWith('character:')
  ? 'character:' + (replacements[item.slice(10)] ?? item.slice(10)) : item;
const equivalentItems = item => [item, ...Object.entries(replacements)
  .filter(([, replacement]) => item === 'character:' + replacement)
  .map(([previous]) => 'character:' + previous)];

function ownerId(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  if (!/^[1-9]\d{0,15}$/.test(text) || !Number.isSafeInteger(Number(text))) {
    throw Error('OWNER_TELEGRAM_ID must be a positive, safe integer Telegram User ID.');
  }
  return text;
}
module.exports = {replacements, canonicalItem, equivalentItems, ownerId};
