// Shared Shopify-backed configuration for Quick Sale. No device-local authority.
export const CONFIG_TYPE = '$app:configurable_quick_sales';
export const CONFIG_HANDLE = 'default';
export const CACHE_KEY = 'legendary-pos.configurable-sales-v1';
export const MAX_SALES = 40;

export const DEFAULT_SALES = [
  {id:'orangeade-divers', title:'Orangeade', description:'Divers', vendor:'Orangeade Vintage', priceMode:'variable', fixedPrice:'', variantId:'', taxable:true, enabled:true},
  {id:'orangeade-friperie', title:'Orangeade', description:'Friperie', vendor:'Orangeade Vintage', priceMode:'variable', fixedPrice:'', variantId:'', taxable:true, enabled:true},
  {id:'pro-dvds-divers', title:'Pro des DVDs', description:'Divers', vendor:'Pro des DVDs', priceMode:'variable', fixedPrice:'', variantId:'', taxable:true, enabled:true},
  // Existing Just4Games catalog product (vendor: Pro des DVDs); catalog controls price, inventory and tax.
  {id:'pro-dvds-tshirt', title:'Pro des DVDs', description:'T-Shirt', vendor:'Pro des DVDs', priceMode:'catalog', fixedPrice:'', variantId:'68031590891793', taxable:true, enabled:true},
];

export function defaultConfig() {
  return {version:1, sales:DEFAULT_SALES.map(s => ({...s}))};
}
export function saleLabel(sale) {
  return [sale.title, sale.description].filter(Boolean).join(' - ');
}
export function priceCents(raw) {
  const value = String(raw ?? '').trim().replace(',', '.');
  if (!/^(?:[0-9]+|[0-9]+\.[0-9]{1,2}|\.[0-9]{1,2})$/.test(value)) return null;
  const pieces = value.split('.');
  const n = Number(pieces[0] || '0') * 100 + Number((pieces[1] || '').padEnd(2, '0'));
  return Number.isSafeInteger(n) && n > 0 && n <= 99999999 ? n : null;
}
export function amountFromCents(cents) {
  return (cents / 100).toFixed(2);
}
export function appendPriceDigit(price, digit) {
  if (!/^[0-9]$/.test(String(digit))) return price;
  const current = priceCents(price) ?? 0;
  const next = current * 10 + Number(digit);
  return next > 99999999 ? price : amountFromCents(next);
}
export function backspacePrice(price) {
  return amountFromCents(Math.floor((priceCents(price) ?? 0) / 10));
}

export function validVariantId(raw) {
  const value = String(raw ?? '').trim().replace('gid://shopify/ProductVariant/', '');
  const numeric = Number(value);
  return /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(numeric) ? value : null;
}
export function validateSale(input) {
  if (!input || typeof input !== 'object') throw new Error('Sale type is required.');
  const id = String(input.id ?? '').trim().toLowerCase();
  const title = String(input.title ?? '').trim();
  const description = String(input.description ?? '').trim();
  const vendor = String(input.vendor ?? '').trim();
  if (!/^[a-z0-9-]{1,42}$/.test(id)) throw new Error('Invalid sale type ID.');
  if (!title || title.length > 48) throw new Error('Title must be 1–48 characters.');
  if (!description || description.length > 60) throw new Error('Description must be 1–60 characters.');
  if (!vendor || vendor.length > 80) throw new Error('Vendor must be 1–80 characters.');
  const priceMode = String(input.priceMode ?? 'variable');
  if (!['variable', 'fixed', 'catalog'].includes(priceMode)) throw new Error('Choose a valid pricing mode.');
  const fixedPrice = priceMode === 'fixed' ? String(input.fixedPrice ?? '').trim().replace(',', '.') : '';
  const variantId = priceMode === 'catalog' ? validVariantId(input.variantId) : '';
  if (priceMode === 'fixed' && priceCents(fixedPrice) === null) throw new Error('Enter a fixed price greater than zero.');
  if (priceMode === 'catalog' && !variantId) throw new Error('Enter a valid Shopify product variant ID.');
  return {id,title,description,vendor,priceMode,fixedPrice,variantId,
    taxable:input.taxable !== false,enabled:input.enabled !== false};
}
export function cleanConfig(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sales)) return defaultConfig();
  if (raw.sales.length > MAX_SALES) throw new Error('Maximum of 40 sale types.');
  const seen = new Set(), names = new Set();
  const sales = raw.sales.map(s => {
    const sale = validateSale(s);
    if (seen.has(sale.id)) throw new Error('Duplicate sale type ID.');
    const name = saleLabel(sale).toLocaleLowerCase();
    if (names.has(name)) throw new Error('Duplicate title and description.');
    seen.add(sale.id); names.add(name);
    return sale;
  });
  return {version:1,sales};
}
export function newSaleId(title, description, sales) {
  const base = (String(title) + '-' + String(description)).normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g,'-')
    .replace(/^-|-$/g,'').slice(0,32) || 'sale';
  const existing = new Set(sales.map(s=>s.id));
  let id = base, count = 2;
  while (existing.has(id)) id = base.slice(0,32) + '-' + count++;
  return id;
}
export function cartProperties(sale, {upc='', title=''}={}) {
  const props = {
    '_J4G Sale Type': saleLabel(sale),
    '_J4G Vendor': sale.vendor,
    '_J4G Category': sale.description,
    '_J4G Sale Source': 'legendary-pos-quick-sale',
  };
  const code = String(upc).trim().slice(0,64);
  const itemTitle = String(title).trim().slice(0,180);
  if (code) props.UPC = code;
  else if (itemTitle) props.Title = itemTitle;
  return props;
}
export function cartInstruction(sale, price) {
  const valid = validateSale(sale);
  const properties = cartProperties(valid);
  if (valid.priceMode === 'catalog') {
    return {method:'variant',variantId:Number(valid.variantId),properties};
  }
  const cents = priceCents(valid.priceMode === 'fixed' ? valid.fixedPrice : price);
  if (cents === null) throw new Error('Enter a price greater than zero.');
  return {method:'custom',item:{title:saleLabel(valid),price:amountFromCents(cents),quantity:1,taxable:valid.taxable},properties};
}

const QUERY = [
  'query QuickSaleConfig($handle: MetaobjectHandleInput!) {',
  ' metaobjectByHandle(handle: $handle) { updatedAt field(key: "settings") { value } }',
  '}',
].join(' ');
const UPSERT = [
  'mutation SaveQuickSaleConfig($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {',
  ' metaobjectUpsert(handle: $handle, metaobject: $metaobject) {',
  '  metaobject { id handle } userErrors { field message }',
  ' }',
  '}',
].join(' ');

async function graphql(query, variables) {
  const response = await fetch('shopify:admin/api/graphql.json', {
    method:'POST',body:JSON.stringify({query,variables}),
  });
  if (!response.ok) throw new Error('Shopify Admin API HTTP ' + response.status + '. Check POS version and metaobject permissions.');
  const json = await response.json();
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
  return json.data;
}
export async function readRemoteConfig() {
  const result = await graphql(QUERY,{handle:{type:CONFIG_TYPE,handle:CONFIG_HANDLE}});
  const node = result?.metaobjectByHandle;
  if (!node?.field?.value) return {config:defaultConfig(),updatedAt:null,initialized:false};
  let decoded;
  try {decoded = JSON.parse(node.field.value);} catch {throw new Error('Saved Quick Sale config is invalid JSON.');}
  return {config:cleanConfig(decoded),updatedAt:node.updatedAt,initialized:true};
}
export async function writeRemoteConfig(config, expectedUpdatedAt) {
  const clean = cleanConfig(config);
  const latest = await readRemoteConfig();
  if (latest.updatedAt !== expectedUpdatedAt) throw new Error('Another device changed sale types. Reopen Quick Sale to reload before saving.');
  const result = await graphql(UPSERT,{
    handle:{type:CONFIG_TYPE,handle:CONFIG_HANDLE},
    metaobject:{fields:[
      {key:'name',value:'Just4Games configurable sale types'},
      {key:'settings',value:JSON.stringify(clean)},
    ]},
  });
  const mutation = result?.metaobjectUpsert;
  if (!mutation?.metaobject || mutation.userErrors?.length) {
    throw new Error(mutation?.userErrors?.map(e => e.message).join('; ') || 'Settings were not saved.');
  }
  return readRemoteConfig();
}
export async function readCache() {
  try { const cached = await shopify.storage.get(CACHE_KEY); return cached ? cleanConfig(cached) : null; }
  catch {return null;}
}
export async function writeCache(config) {
  try { await shopify.storage.set(CACHE_KEY,cleanConfig(config)); } catch { /* Cache is optional. */ }
}
