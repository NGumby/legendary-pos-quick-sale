// LEGENDARY-POS-UI-V5
// Store-wide settings are an app-owned Shopify metaobject, not a per-device file.
// An extension can read/write them over the authenticated POS Direct Admin API.
export const SETTINGS_TYPE = '$app:quick_sale_settings';
export const SETTINGS_HANDLE = 'default';
export const SETTINGS_CACHE_KEY = 'legendary-pos.settings-v3';
export const MONT_ROYAL_LOCATION_ID = '112354328849';
export const MONT_ROYAL_PRICE_LIST_ID = 'gid://shopify/PriceList/31546081553';

const defaultFormats = [
  ['dvd', 'DVD'], ['bluray', 'Blu-ray'], ['cd', 'CD'], ['game', 'Game'],
  ['vinyl', 'Vinyl'], ['lego', 'LEGO'], ['figurine', 'Figurine'], ['other', 'Other'],
];

export function defaultSettings() {
  return {
    version: 3,
    formats: defaultFormats.map(([id, label]) => ({
      id, label, used: true, new: true, vendor: 'Store', taxable: true,
    })),
    retail: {locationId: MONT_ROYAL_LOCATION_ID, priceListId: MONT_ROYAL_PRICE_LIST_ID},
  };
}

export function cleanSettings(raw) {
  const defaults = defaultSettings();
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.formats)) return defaults;
  const seen = new Set();
  const formats = [];
  for (const f of raw.formats.slice(0, 40)) {
    if (!f || typeof f !== 'object') continue;
    const id = String(f.id || '').toLowerCase();
    const label = String(f.label || '').trim();
    if (!/^[a-z0-9-]{1,28}$/.test(id) || !label || label.length > 36 || seen.has(id)) continue;
    seen.add(id);
    formats.push({
      id, label, used: f.used !== false, new: f.new !== false,
      vendor: String(f.vendor || 'Store').trim().slice(0, 80), taxable: f.taxable !== false,
    });
  }
  if (!formats.length) return defaults;
  // This app is dedicated to Just4Games. Ignore stale/empty saved IDs:
  // the price list is verified against the actual POS location before writes.
  return {version: 3, formats,
    retail: {locationId: MONT_ROYAL_LOCATION_ID, priceListId: MONT_ROYAL_PRICE_LIST_ID}};
}

export function selectedFormat(settings, preferredId, condition) {
  const flag = condition === 'New' ? 'new' : 'used';
  return settings.formats.find(f => f.id === preferredId && f[flag]) ||
    settings.formats.find(f => f[flag]) || null;
}

export function presetFor(settings, formatId, condition) {
  const f = selectedFormat(settings, formatId, condition);
  if (!f) throw new Error('No enabled formats for this condition.');
  return {id: `${condition.toLowerCase()}-${f.id}`, label: `${condition} ${f.label}`,
    format: f.label, condition, vendor: f.vendor, taxable: f.taxable};
}

export function slugFormat(label, settings) {
  const id = String(label || '').trim().toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28);
  if (!id) throw new Error('Enter a format name with letters or numbers.');
  if (settings.formats.some(f => f.id === id)) throw new Error('This format already exists.');
  return id;
}

export const QUERY_SETTINGS = `#graphql
  query QuickSaleSettings($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) { field(key: "settings") { value } }
  }`;
export const UPSERT_SETTINGS = `#graphql
  mutation SaveQuickSaleSettings($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject { id handle }
      userErrors { field message }
    }
  }`;

export async function adminGraphql(query, variables) {
  const response = await fetch('shopify:admin/api/graphql.json', {
    method: 'POST', body: JSON.stringify({query, variables}),
  });
  if (!response.ok) throw new Error(`Shopify Admin API returned HTTP ${response.status}. Check app scopes.`);
  const result = await response.json();
  if (result.errors?.length) throw new Error(result.errors.map(e => e.message).join('; '));
  return result.data;
}

export async function loadSettings() {
  const data = await adminGraphql(QUERY_SETTINGS, {handle: {type: SETTINGS_TYPE, handle: SETTINGS_HANDLE}});
  const value = data?.metaobjectByHandle?.field?.value;
  if (!value) return defaultSettings();
  try { return cleanSettings(JSON.parse(value)); }
  catch { throw new Error('Quick Sale settings saved on Shopify are invalid JSON.'); }
}

export async function saveSettings(settings) {
  if (!Array.isArray(settings?.formats) || !settings.formats.length) throw new Error('At least one format is required.');
  for (const format of settings.formats) {
    if (!String(format.label || '').trim()) throw new Error('Every format needs a name.');
  }
  if (settings.retail?.priceListId && !/^gid:\/\/shopify\/PriceList\/\d+$/.test(settings.retail.priceListId.trim()))
    throw new Error('Price list must be a full Shopify PriceList GID, e.g. gid://shopify/PriceList/12345');
  if (!/^\d+$/.test(String(settings.retail?.locationId || '')))
    throw new Error('Enter the numeric Shopify POS location ID.');
  const clean = cleanSettings(settings);
  const data = await adminGraphql(UPSERT_SETTINGS, {
    handle: {type: SETTINGS_TYPE, handle: SETTINGS_HANDLE},
    metaobject: {fields: [
      {key: 'name', value: 'Legendary POS Quick Sale'},
      {key: 'settings', value: JSON.stringify(clean)},
    ]},
  });
  const result = data?.metaobjectUpsert;
  if (!result?.metaobject || result?.userErrors?.length) {
    throw new Error(result?.userErrors?.map(e => e.message).join('; ') || 'Shopify did not save settings.');
  }
  return clean;
}

export async function loadCachedSettings() {
  try { const v = await shopify.storage.get(SETTINGS_CACHE_KEY); return v ? cleanSettings(v) : null; }
  catch { return null; }
}
export async function cacheSettings(settings) {
  try { await shopify.storage.set(SETTINGS_CACHE_KEY, settings); } catch (_) { /* Cache is optional. */ }
}
