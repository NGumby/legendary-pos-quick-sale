// Pure helpers shared by the POS extension and local unit tests.
export function normalizeUpc(value) {
  // Do not cast to Number: UPC/EAN codes can contain leading zeroes.
  return String(value ?? '').trim().replace(/[\r\n\t]/g, '').slice(0, 64);
}

export function parsePriceToCents(raw) {
  const value = String(raw ?? '').trim().replace(',', '.');
  if (!/^(?:\d+|\d+\.\d{1,2}|\.\d{1,2})$/.test(value)) return null;
  const [dollars, fraction = ''] = value.split('.');
  const cents = Number(dollars || '0') * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 99999999 ? cents : null;
}

export function formatCents(cents) {
  return (cents / 100).toFixed(2);
}

// Fast retail keypad: pressing 5, 9, 9 produces $5.99.
export function appendKeypadDigit(currentPrice, digit) {
  if (!/^\d$/.test(String(digit))) throw new Error('Invalid digit');
  const cents = parsePriceToCents(currentPrice) ?? 0;
  const next = cents * 10 + Number(digit);
  if (next > 99999999) return currentPrice;
  return formatCents(next);
}

export function deleteKeypadDigit(currentPrice) {
  return formatCents(Math.floor((parsePriceToCents(currentPrice) ?? 0) / 10));
}

export function buildSale(preset, fields) {
  if (!preset || !preset.label || !preset.format || !preset.condition) {
    throw new Error('Choose a valid sale type.');
  }
  const priceCents = parsePriceToCents(fields.price);
  if (priceCents === null) throw new Error('Enter a selling price greater than zero.');
  const upc = normalizeUpc(fields.upc);
  const title = String(fields.title ?? '').trim().slice(0, 180);
  const displayTitle = title ? `${preset.label} - ${title}`.slice(0, 240) : preset.label;
  const properties = {
    'Sale Type': preset.label,
    'Format': preset.format,
    'Condition': preset.condition,
    'Vendor': preset.vendor || 'Store',
    '_Quick Sale Source': 'legendary-pos-quick-sale',
  };
  if (upc) properties['UPC'] = upc;
  if (title) properties['Item Title'] = title;
  return {
    item: {title: displayTitle, price: formatCents(priceCents), quantity: 1, taxable: preset.taxable !== false},
    properties,
  };
}
