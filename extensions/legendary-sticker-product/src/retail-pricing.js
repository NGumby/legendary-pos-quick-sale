import {adminGraphql, MONT_ROYAL_LOCATION_ID} from './settings.js';
import {parsePriceToCents, formatCents} from './logic.js';

// A list is safe only if its catalog is assigned to exactly one retail market,
// and that market targets exactly one POS location: the selected Mont-Royal location.
export const QUERY_PRICE_LIST = `#graphql
  query CheckRetailPriceList($id: ID!) {
    priceList(id: $id) {
      id currency name catalog {
        __typename id title
        ... on MarketCatalog {
          markets(first: 2) {
            nodes {
              id name type
              conditions {
                locationsCondition {
                  locations(first: 2) { nodes { id } pageInfo { hasNextPage } }
                }
              }
            }
            pageInfo { hasNextPage }
          }
        }
      }
    }
  }`;

export const SAVE_RETAIL_PRICE = `#graphql
  mutation SaveMontRoyalPrice($priceListId: ID!, $prices: [PriceListPriceInput!]!) {
    priceListFixedPricesAdd(priceListId: $priceListId, prices: $prices) {
      prices { price { amount currencyCode } }
      userErrors { field message code }
    }
  }`;

export function verifyExclusiveRetailList(priceList, locationId) {
  if (!priceList || priceList.currency !== 'CAD') throw new Error('Retail price list is missing or not in CAD.');
  const catalog = priceList.catalog;
  if (catalog?.__typename !== 'MarketCatalog') throw new Error('Price list must belong to a Retail Market catalog.');
  const linked = catalog.markets;
  if (!linked || linked.pageInfo?.hasNextPage || linked.nodes?.length !== 1)
    throw new Error('Price list must be assigned to exactly one Retail Market.');
  const market = linked.nodes[0];
  if (market.type !== 'LOCATION') throw new Error('Price list market is not restricted to POS locations.');
  const locations = market.conditions?.locationsCondition?.locations;
  if (!locations || locations.pageInfo?.hasNextPage || locations.nodes?.length !== 1 ||
      locations.nodes[0]?.id !== `gid://shopify/Location/${locationId}`)
    throw new Error('Price list must target Mont-Royal only, not multiple locations.');
  return true;
}

export async function checkRetailPriceList(settings, actualLocationId, shopDomain) {
  if (shopDomain === 'just4games.myshopify.com' && String(actualLocationId) !== MONT_ROYAL_LOCATION_ID)
    throw new Error('On Just4Games this action is restricted to J4G - Mont-Royal.');
  if (shopDomain === 'just4games.myshopify.com' && String(settings.retail?.locationId) !== MONT_ROYAL_LOCATION_ID)
    throw new Error('Mont-Royal location setting was modified; restore ID 112354328849.');
  const locationId = String(settings.retail?.locationId ?? '');
  if (locationId !== String(actualLocationId)) throw new Error('This POS is not assigned to the configured Mont-Royal location.');
  const id = settings.retail?.priceListId;
  if (!/^gid:\/\/shopify\/PriceList\/\d+$/.test(id || ''))
    throw new Error('Configure a Mont-Royal Retail Market price list in Quick Sale settings first.');
  const data = await adminGraphql(QUERY_PRICE_LIST, {id});
  verifyExclusiveRetailList(data?.priceList, locationId);
  return id;
}

export async function writeRetailPrice({settings, actualLocationId, shopDomain, variantId, cents}) {
  const priceListId = await checkRetailPriceList(settings, actualLocationId, shopDomain);
  if (!Number.isSafeInteger(Number(variantId)) || Number(variantId) <= 0) throw new Error('This cart line has no Shopify product variant.');
  const amount = formatCents(cents);
  if (parsePriceToCents(amount) !== cents) throw new Error('Invalid sticker price.');
  const data = await adminGraphql(SAVE_RETAIL_PRICE, {
    priceListId,
    prices: [{variantId: `gid://shopify/ProductVariant/${variantId}`, price: {amount, currencyCode: 'CAD'}}],
  });
  const response = data?.priceListFixedPricesAdd;
  if (response?.userErrors?.length || !response?.prices?.length) {
    throw new Error(response?.userErrors?.map(e => e.message).join('; ') || 'Shopify did not save the price.');
  }
  return amount;
}

// Display the actual Mont-Royal market price on the scanned product's POS details.
// When no location-specific price exists, label the online/base price explicitly.
export const READ_RETAIL_PRICE = `#graphql
  query ReadMontRoyalPrice($priceListId: ID!, $variantId: ID!, $priceQuery: String!) {
    priceList(id: $priceListId) {
      prices(first: 5, query: $priceQuery) {
        nodes {
          variant { id }
          originType
          price { amount currencyCode }
        }
      }
    }
    productVariant(id: $variantId) { displayName price }
  }`;

export async function readRetailPrice({priceListId, variantId}) {
  const numericId = String(variantId ?? '').trim();
  if (!/^\d+$/.test(numericId) || !Number.isSafeInteger(Number(numericId)) || Number(numericId) <= 0)
    throw new Error('Select a valid Shopify product variant.');
  if (!/^gid:\/\/shopify\/PriceList\/\d+$/.test(priceListId || ''))
    throw new Error('The Mont-Royal price list is not configured.');
  const variantGid = 'gid://shopify/ProductVariant/' + numericId;
  const data = await adminGraphql(READ_RETAIL_PRICE, {
    priceListId, variantId: variantGid, priceQuery: 'variant_id:' + numericId,
  });
  if (!data?.priceList || !data?.productVariant)
    throw new Error('Shopify could not load this product or its Mont-Royal catalog.');
  const listedPrice = data.priceList.prices?.nodes?.find(
    node => node?.variant?.id === variantGid && node?.price?.currencyCode === 'CAD'
  );
  const amount = Number(listedPrice?.price?.amount ?? data.productVariant.price);
  if (!Number.isFinite(amount) || amount < 0)
    throw new Error('Shopify did not return a valid product price.');
  return {
    amount: amount.toFixed(2),
    source: listedPrice?.originType === 'FIXED' ? 'Mont-Royal sticker price'
      : listedPrice ? 'Mont-Royal market price' : 'Base product price (no Mont-Royal override)',
    title: String(data.productVariant.displayName || '').replace(/ - Default Title$/, ''),
  };
}
