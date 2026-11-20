import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {readRetailPrice} from './retail-pricing.js';
import {MONT_ROYAL_LOCATION_ID, MONT_ROYAL_PRICE_LIST_ID} from './settings.js';

function ProductStickerBlock() {
  const variantId = Number(shopify.product?.variantId);
  const hasVariant = Number.isSafeInteger(variantId) && variantId > 0;
  const session = shopify.session.currentSession;
  const atMontRoyal = String(session?.locationId) === MONT_ROYAL_LOCATION_ID;
  const [price, setPrice] = useState(null);
  const [status, setStatus] = useState('Loading current price…');

  useEffect(() => {
    let active = true;
    setPrice(null);
    if (!hasVariant || !atMontRoyal) {
      setStatus(!atMontRoyal ? 'Price updates are available at Mont-Royal only.' : 'Select a variant to see its price.');
      return () => { active = false; };
    }
    setStatus('Loading current price…');
    readRetailPrice({priceListId: MONT_ROYAL_PRICE_LIST_ID, variantId})
      .then(result => {
        if (!active) return;
        setPrice(result);
        setStatus('');
      })
      .catch(() => { if (active) setStatus('Current price unavailable. Open Sticker Price to retry.'); });
    return () => { active = false; };
  }, [variantId, atMontRoyal]);

  return (
    <s-pos-block heading="Current price — J4G Mont-Royal">
      <s-button slot="secondary-actions"
        disabled={!hasVariant || !atMontRoyal}
        onClick={() => shopify.action.presentModal()}>
        Sticker Price
      </s-button>
      {price
        ? <s-heading>{'{price.amount} CAD</s-heading>
        : <s-text>{status}</s-text>}
      {price && <s-text tone="subdued">{price.source}</s-text>}
    </s-pos-block>
  );
}

export default async () => { render(<ProductStickerBlock />, document.body); };
}{price.amount} CAD</s-heading>
        : <s-text>{status}</s-text>}
      {price && <s-text tone="subdued">{price.source}</s-text>}
    </s-pos-block>
  );
}

export default async () => { render(<ProductStickerBlock />, document.body); };
