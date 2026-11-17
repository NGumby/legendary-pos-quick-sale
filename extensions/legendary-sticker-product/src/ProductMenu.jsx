import '@shopify/ui-extensions/preact';
import {render} from 'preact';

function ProductStickerMenu() {
  const variantId = Number(shopify.product?.variantId);
  return (
    <s-button
      disabled={!Number.isSafeInteger(variantId) || variantId <= 0}
      onClick={() => shopify.action.presentModal()}
    >
      Set Mont-Royal sticker price
    </s-button>
  );
}

export default async () => { render(<ProductStickerMenu />, document.body); };
