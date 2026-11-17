import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {appendKeypadDigit, deleteKeypadDigit, parsePriceToCents} from './logic.js';
import {defaultSettings, loadSettings, loadCachedSettings} from './settings.js';
import {checkRetailPriceList, writeRetailPrice} from './retail-pricing.js';

const KEYS = ['1','2','3','4','5','6','7','8','9','Clear','0','Back'];
function StickerPrice() {
  const item = shopify.cartLineItem;
  const locationId = String(shopify.session.currentSession.locationId);
  const shopDomain = shopify.session.currentSession.shopDomain;
  const [settings, setSettings] = useState(defaultSettings());
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const cached = await loadCachedSettings();
      if (mounted && cached) setSettings(cached);
      try {const remote = await loadSettings(); if (mounted) setSettings(remote);}
      catch (e) {if (mounted) setError('Cannot load shared settings: ' + (e.message || String(e)));}
    })();
    return () => {mounted = false;};
  }, []);

  const valid = parsePriceToCents(price) !== null;
  async function verify() {
    setError(''); setMessage(''); setChecked(false); setBusy(true);
    try {
      await checkRetailPriceList(settings, locationId, shopDomain);
      setChecked(true);
      setMessage('Verified: this price list targets this one POS retail location.');
    } catch (e) {setError(e.message || String(e));}
    finally {setBusy(false);}
  }
  async function save() {
    if (busy || !checked || !valid) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const actual = await writeRetailPrice({
        settings, actualLocationId: locationId, shopDomain, variantId: item.variantId,
        cents: parsePriceToCents(price),
      });
      setMessage(`Mont-Royal price saved as $${actual} CAD for this Shopify variant. Remove the old cart line and scan the product again to use the new price.`);
      shopify.toast.show('Mont-Royal retail price saved');
      setChecked(false); // Prevent unintentional duplicate writes.
    } catch (e) {setError(e.message || String(e));}
    finally {setBusy(false);}
  }

  return (
    <s-page heading="Mont-Royal sticker price" subheading="Change this product's retail market price only">
      <s-box padding="base">
        <s-stack gap="base">
          <s-text type="strong">{item?.title || 'Selected Shopify product'}</s-text>
          <s-text>SKU: {item?.sku || '—'} · Current cart unit price: ${item?.price ?? '—'} · Qty: {item?.quantity ?? 1}</s-text>
          <s-text>POS location ID: {locationId}</s-text>
          {error && <s-banner tone="critical">{error}</s-banner>}
          {message && <s-banner tone="info">{message}</s-banner>}
          {!item?.variantId && <s-banner tone="critical">This item is not a catalog product variant. Use Quick Sale instead.</s-banner>}
          <s-text type="strong">Sticker price: ${price || '0.00'} CAD</s-text>
          {[0,1,2,3].map(row => (
            <s-stack key={row} direction="inline" gap="small">
              {KEYS.slice(row * 3, row * 3 + 3).map(key => (
                <s-button key={key} disabled={busy} onClick={() => {
                  setChecked(false);
                  if (key === 'Clear') setPrice('');
                  else if (key === 'Back') setPrice(old => deleteKeypadDigit(old));
                  else setPrice(old => appendKeypadDigit(old,key));
                }}>{key}</s-button>
              ))}
            </s-stack>
          ))}
          <s-stack direction="inline" gap="small">
            <s-button variant="secondary" disabled={busy || !item?.variantId} loading={busy} onClick={verify}>Verify Mont-Royal catalog</s-button>
            <s-button variant="primary" disabled={busy || !valid || !checked || !item?.variantId} loading={busy} onClick={save}>Save Mont-Royal price</s-button>
          </s-stack>
          <s-text>Does not change the global product price. Requires an active POS Pro Retail Market catalog assigned exclusively to this location. A sale already in the cart must be removed and rescanned to pick up the updated price; this action does not override that cart line.</s-text>
        </s-stack>
      </s-box>
    </s-page>
  );
}
export default async () => {render(<StickerPrice />, document.body);};
