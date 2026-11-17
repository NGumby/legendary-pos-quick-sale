// LEGENDARY-POS-J4G-V9.5
import '@shopify/ui-extensions/preact';
import {render} from 'preact';

function UpdatePriceJ4GMenu() {
  const item = shopify.cartLineItem;
  return (
    <s-button disabled={!item?.variantId || item?.isGiftCard}
      onClick={() => shopify.action.presentModal()}>
      Update Price J4G
    </s-button>
  );
}
export default async () => {render(<UpdatePriceJ4GMenu />, document.body);};
