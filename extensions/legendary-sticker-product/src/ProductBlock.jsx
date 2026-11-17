import '@shopify/ui-extensions/preact';
import {render} from 'preact';

function ProductStickerBlock() {
  const variantId = Number(shopify.product?.variantId);
  return (
    <s-pos-block>
      <s-button
        slot="secondary-actions"
        disabled={!Number.isSafeInteger(variantId) || variantId <= 0}
        onClick={() => shopify.action.presentModal()}
      >
        Sticker Price
      </s-button>
      <s-text>Mont-Royal only: save the price shown on this item's sticker.</s-text>
    </s-pos-block>
  );
}

export default async () => { render(<ProductStickerBlock />, document.body); };
