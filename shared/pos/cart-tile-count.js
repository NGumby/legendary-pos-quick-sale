// Pure cart badge logic shared by the existing J4G POS home tiles.
// We count only sales that carry our app's line-item metadata, not unrelated
// catalog products or custom-sale lines created outside the J4G extensions.

const SOURCE = 'legendary-pos-quick-sale';

function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

export function countCartItemsForTile(cart, kind, value = '') {
  const lineItems = Array.isArray(cart?.lineItems) ? cart.lineItems : [];
  let count = 0;

  for (const item of lineItems) {
    const properties = item?.properties || {};
    const vendorSale = properties['_J4G Sale Source'] === SOURCE;
    const quickSale = properties['_Quick Sale Source'] === SOURCE;

    if (kind === 'vendors') {
      if (!vendorSale) continue;
    } else if (kind === 'condition') {
      if (!quickSale || normalize(properties['_J4G Condition']) !== normalize(value)) continue;
    } else if (kind === 'saleType') {
      // The other J4G tiles share a format catalog, not a unique cart source.
      // Identify the chosen sale by its recorded type, regardless of the tile
      // through which it was opened. This avoids counting unrelated products.
      const recordedType = properties['_J4G Sale Type'] || item?.title;
      if (!quickSale || normalize(recordedType) !== normalize(value)) continue;
    } else {
      return 0;
    }

    const quantity = Number(item?.quantity);
    if (Number.isFinite(quantity) && quantity > 0) {
      count += Math.floor(quantity);
    }
  }
  return count;
}
