import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {countCartItemsForTile} from '../../../shared/pos/cart-tile-count.js';
import {ACTIVE_PRESET_ID, PRESETS} from './presets.js';

function Tile() {
  // Count matching items in the CURRENT cart, not a lifetime sales total.
  const [itemCount, setItemCount] = useState(() =>
    countCartItemsForTile(shopify.cart.current.value, 'saleType', preset.label)
  );
  useEffect(() => shopify.cart.current.subscribe(cart => {
    setItemCount(countCartItemsForTile(cart, 'saleType', preset.label));
  }), []);
  const preset = PRESETS.find((item) => item.id === ACTIVE_PRESET_ID) || PRESETS[0];
  return (
    <s-tile
      heading={preset.label}
      subheading="Scan + price"
      tone="accent"
      itemCount={itemCount || undefined}
      onClick={() => shopify.action.presentModal()}
    />
  );
}

export default async () => {
  render(<Tile />, document.body);
};
