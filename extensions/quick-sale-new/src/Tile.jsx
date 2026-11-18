// LEGENDARY-POS-QUICK-SALE-V9.1
import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {countCartItemsForTile} from '../../../shared/pos/cart-tile-count.js';

function Tile() {
  // Count matching items in the CURRENT cart, not a lifetime sales total.
  const [itemCount, setItemCount] = useState(() =>
    countCartItemsForTile(shopify.cart.current.value, 'condition', 'New')
  );
  useEffect(() => shopify.cart.current.subscribe(cart => {
    setItemCount(countCartItemsForTile(cart, 'condition', 'New'));
  }), []);
  return (
    <s-tile
      heading="J4G - New"
      subheading="Choose type + price"
      tone="accent"
      itemCount={itemCount || undefined}
      onClick={() => shopify.action.presentModal()}
    />
  );
}

export default async () => {
  render(<Tile />, document.body);
};
