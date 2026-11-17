import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {appendKeypadDigit, deleteKeypadDigit, parsePriceToCents} from './logic.js';
import {defaultSettings, loadCachedSettings, loadSettings} from './settings.js';
import {checkRetailPriceList, writeRetailPrice} from './retail-pricing.js';

// These IDs are intentionally hardcoded only for the Just4Games production shop.
// checkRetailPriceList also checks that Shopify's catalog is exclusive to this one location.
const PRODUCTION_SHOP = 'just4games.myshopify.com';
const MONT_ROYAL_LOCATION_ID = '112354328849';
const MONT_ROYAL_PRICE_LIST_ID = 'gid://shopify/PriceList/31546081553';
const KEYS = ['1','2','3','4','5','6','7','8','9','Clear','0','Back'];

export function effectiveStickerSettings(raw, shopDomain) {
  const source = raw || defaultSettings();
  if (shopDomain !== PRODUCTION_SHOP) return source;
  return {
    ...source,
    retail: {
      ...(source.retail || {}),
      locationId: MONT_ROYAL_LOCATION_ID,
      priceListId: MONT_ROYAL_PRICE_LIST_ID,
    },
  };
}

function ProductStickerPrice() {
  const product = shopify.product;
  const productId = Number(product?.id);
  const variantId = Number(product?.variantId);
  const session = shopify.session.currentSession;
  const locationId = String(session.locationId);
  const shopDomain = session.shopDomain;
  const atMontRoyal = shopDomain !== PRODUCTION_SHOP || locationId === MONT_ROYAL_LOCATION_ID;
  const hasVariant = Number.isSafeInteger(variantId) && variantId > 0;

  const [settings, setSettings] = useState(defaultSettings());
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cached = await loadCachedSettings();
        if (active && cached) setSettings(cached);
      } catch (_) { /* Cached formats are optional. */ }
      try {
        const saved = await loadSettings();
        if (active && saved) setSettings(saved);
      } catch (e) {
        // Do not block the production catalog: the verified IDs are embedded.
        if (active && shopDomain !== PRODUCTION_SHOP) {
          setError('Cannot load store settings: ' + (e.message || String(e)));
        }
      }
    })();
    return () => { active = false; };
  }, []);

  const cents = parsePriceToCents(price);
  const valid = Number.isSafeInteger(cents) && cents > 0;
  const resolved = effectiveStickerSettings(settings, shopDomain);

  async function verify() {
    if (busy || !hasVariant || !atMontRoyal) return;
    setBusy(true);
    setVerified(false);
    setError('');
    setMessage('');
    try {
      await checkRetailPriceList(resolved, locationId, shopDomain);
      setVerified(true);
      setMessage('Verified: this retail price list belongs only to the selected POS location.');
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (busy || !hasVariant || !atMontRoyal || !verified || !valid) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const amount = await writeRetailPrice({
        settings: resolved,
        actualLocationId: locationId,
        shopDomain,
        variantId,
        cents,
      });
      setVerified(false);
      setMessage(`Saved Mont-Royal retail price: $${amount} CAD. Add the product to the cart after this update. If it is already in the cart, remove and rescan that line to pick up its new catalog price.`);
      shopify.toast.show('Mont-Royal sticker price saved');
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <s-page heading="Mont-Royal sticker price" subheading="Product details: save location-only retail price">
      <s-box padding="base">
        <s-stack gap="base">
          <s-text>Product ID: {Number.isSafeInteger(productId) ? productId : 'Unknown'} · Variant ID: {hasVariant ? variantId : 'Unavailable'}</s-text>
          <s-text>POS location: {locationId}</s-text>
          {!atMontRoyal && <s-banner tone="critical"><s-text>Price changes are restricted to J4G - Mont-Royal. No other Just4Games location can write to this price list.</s-text></s-banner>}
          {!hasVariant && <s-banner tone="critical"><s-text>Shopify POS has not provided a valid product variant. Select a catalog variant before changing its price.</s-text></s-banner>}
          {error && <s-banner tone="critical"><s-text>{error}</s-text></s-banner>}
          {message && <s-banner tone="info"><s-text>{message}</s-text></s-banner>}
          <s-text tone="success" type="strong">Price: ${price || '0.00'} CAD</s-text>
          {[0,1,2,3].map(row => (
            <s-stack key={row} direction="inline" gap="small">
              {KEYS.slice(row * 3, row * 3 + 3).map(key => (
                <s-button key={key} disabled={busy} onClick={() => {
                  setVerified(false);
                  setError('');
                  setMessage('');
                  if (key === 'Clear') setPrice('');
                  else if (key === 'Back') setPrice(old => deleteKeypadDigit(old));
                  else setPrice(old => appendKeypadDigit(old, key));
                }}>{key}</s-button>
              ))}
            </s-stack>
          ))}
          <s-button disabled={busy || !hasVariant || !atMontRoyal} loading={busy} onClick={verify}>
            Verify Mont-Royal catalog
          </s-button>
          <s-button variant="primary" disabled={busy || !hasVariant || !atMontRoyal || !verified || !valid} loading={busy} onClick={save}>
            Save Mont-Royal price
          </s-button>
          <s-text>The product keeps its online price. This changes only the verified Mont-Royal Retail Market price list. An existing cart line does not update automatically.</s-text>
        </s-stack>
      </s-box>
    </s-page>
  );
}

export default async () => { render(<ProductStickerPrice />, document.body); };
