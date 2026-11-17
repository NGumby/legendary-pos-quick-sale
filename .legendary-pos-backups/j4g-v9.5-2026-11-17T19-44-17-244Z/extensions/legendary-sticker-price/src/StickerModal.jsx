import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {appendKeypadDigit, deleteKeypadDigit, parsePriceToCents} from './logic.js';
import {defaultSettings, loadSettings, loadCachedSettings} from './settings.js';
import {checkRetailPriceList, writeRetailPrice} from './retail-pricing.js';
import {applyStickerToCart, planStickerAdjustment, findStickerAdjustment} from './cart-adjustment.js';

const KEYS = ['1','2','3','4','5','6','7','8','9','Clear','0','Back'];
function StickerPrice() {
  const item = shopify.cartLineItem;
  const locationId = String(shopify.session.currentSession.locationId);
  const shopDomain = shopify.session.currentSession.shopDomain;
  const [settings, setSettings] = useState(defaultSettings());
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [applied, setApplied] = useState(false);
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

  const cents = parsePriceToCents(price);
  const valid = cents !== null;
  let candidate = null;
  let previewError = '';
  try {
    if (valid) candidate = planStickerAdjustment(item, cents);
  } catch(e) {previewError = e.message || String(e);}

  // Sell-now correction is independent of configuring the permanent Retail Market.
  // Protect live Just4Games from POS devices at other locations.
  const saleLocationAllowed = shopDomain !== 'just4games.myshopify.com' || locationId === '112354328849';

  async function verify() {
    setError(''); setMessage(''); setChecked(false); setBusy(true);
    try {
      await checkRetailPriceList(settings, locationId, shopDomain);
      setChecked(true);
      setMessage('Verified: the price list applies only to this POS retail location.');
    } catch (e) {setError(e.message || String(e));}
    finally {setBusy(false);}
  }

  async function applyNow() {
    if (busy || applied || !valid || !saleLocationAllowed || previewError) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const existing = findStickerAdjustment(shopify.cart.current.value, item.uuid);
      if (existing) throw new Error('An adjustment already exists for this item. Remove it from the cart before trying again.');
      const result = await applyStickerToCart({cart:shopify.cart, selectedUuid:item.uuid, targetCents:cents});
      setApplied(true);
      setMessage(result.message);
      shopify.toast.show(result.plan.kind === 'surcharge' ? 'Sticker adjustment added to cart' : 'Sticker price applied to cart');
    } catch (e) {setError(e.message || String(e));}
    finally {setBusy(false);}
  }

  async function save() {
    if (busy || !checked || !valid) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const actual = await writeRetailPrice({
        settings, actualLocationId: locationId, shopDomain, variantId: item.variantId, cents,
      });
      setMessage(`Future Mont-Royal scans will use $${actual} CAD when the Retail Market price is active. For this open cart, use Apply to current cart separately.`);
      shopify.toast.show('Mont-Royal catalog price saved');
      setChecked(false);
    } catch (e) {setError(e.message || String(e));}
    finally {setBusy(false);}
  }
  return (
    <s-page heading="Mont-Royal sticker price" subheading="Current sale adjustment and separate location price saving">
      <s-box padding="base">
        <s-stack gap="base">
          <s-text type="strong">{item?.title || 'Selected Shopify product'}</s-text>
          <s-text>SKU: {item?.sku || '—'} · Current unit price: ${item?.price ?? '—'} · Qty: {item?.quantity ?? 1}</s-text>
          <s-text>POS location ID: {locationId}</s-text>
          {error && <s-banner tone="critical"><s-text>{error}</s-text></s-banner>}
          {error && <s-text>Error: {error}</s-text>}
          {message && <s-banner tone="info"><s-text>{message}</s-text></s-banner>}
          {previewError && <s-text>{previewError}</s-text>}
          {!saleLocationAllowed && <s-text>This action is restricted to the Mont-Royal POS location on Just4Games.</s-text>}
          <s-text type="strong">Sticker price: ${price || '0.00'} CAD</s-text>
          {[0,1,2,3].map(row => (
            <s-stack key={row} direction="inline" gap="small">
              {KEYS.slice(row * 3, row * 3 + 3).map(key => (
                <s-button key={key} disabled={busy || applied} onClick={() => {
                  setChecked(false); setMessage(''); setError('');
                  if (key === 'Clear') setPrice('');
                  else if (key === 'Back') setPrice(old => deleteKeypadDigit(old));
                  else setPrice(old => appendKeypadDigit(old,key));
                }}>{key}</s-button>
              ))}
            </s-stack>
          ))}
          {candidate && (
            <s-text>{candidate.kind === 'discount'
              ? `Sale-only: $${candidate.amountPerUnit} off per unit; original product remains in the cart.`
              : candidate.kind === 'surcharge'
                ? `Sale-only: adds a SEPARATE $${candidate.amountPerUnit} per-unit sticker adjustment line. Product price itself stays $${candidate.currentPrice}.` 
                : 'No adjustment required: price already matches.'}</s-text>
          )}
          <s-button variant="primary" disabled={busy || applied || !valid || !!previewError || !saleLocationAllowed} loading={busy} onClick={applyNow}>
            {candidate?.kind === 'surcharge' ? 'Add separate sticker price adjustment' : 'Apply to current cart'}
          </s-button>
          <s-text type="strong">Save for future Mont-Royal sales</s-text>
          <s-text>Optional. Requires a POS Pro Retail Market and its exclusive location price list. This is separate from the current cart adjustment.</s-text>
          <s-stack direction="inline" gap="small">
            <s-button variant="secondary" disabled={busy || !item?.variantId} loading={busy} onClick={verify}>Verify Mont-Royal catalog</s-button>
            <s-button variant="secondary" disabled={busy || !valid || !checked || !item?.variantId} loading={busy} onClick={save}>Save Mont-Royal price</s-button>
          </s-stack>
          <s-text>Higher sticker prices cannot overwrite a catalog line in Shopify POS Basic. The sale-only workaround adds a visible adjustment line, keeping the original product for stock and cost reporting. Review its taxes and total before checkout.</s-text>
        </s-stack>
      </s-box>
    </s-page>
  );
}
export default async () => {render(<StickerPrice />, document.body);};
