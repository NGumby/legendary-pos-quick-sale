import '@shopify/ui-extensions/preact';
import {render} from 'preact';

function StickerPriceMenu() {
  const item = shopify.cartLineItem;
  return (
    <s-button disabled={!item?.variantId || item?.isGiftCard}
      onClick={() => shopify.action.presentModal()}>
      Set Mont-Royal sticker price
    </s-button>
  );
}
export default async () => {render(<StickerPriceMenu />, document.body);};
