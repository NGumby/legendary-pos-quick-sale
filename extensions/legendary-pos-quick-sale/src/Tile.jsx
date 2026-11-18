import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {countCartItemsForTile} from '../../../shared/pos/cart-tile-count.js';

function Tile() {
  const [itemCount, setItemCount] = useState(() =>
    countCartItemsForTile(shopify.cart.current.value, 'vendors')
  );
  useEffect(() => shopify.cart.current.subscribe(cart => {
    setItemCount(countCartItemsForTile(cart, 'vendors'));
  }), []);

  return (
    <s-tile
      heading="J4G Vendors"
      subheading="Vendor sales + settings"
      tone="accent"
      itemCount={itemCount || undefined}
      onClick={() => shopify.action.presentModal()}
    />
  );
}

export default async () => {render(<Tile/>,document.body);};
