// LEGENDARY-POS-J4G-V9.5
// Cart-item price editor. The underlying writeRetailPrice() automatically
// verifies that the fixed price list is scoped ONLY to Mont-Royal on every save.
import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {appendKeypadDigit, deleteKeypadDigit, parsePriceToCents} from './logic.js';
import {defaultSettings, loadCachedSettings, loadSettings} from './settings.js';
import {writeRetailPrice} from './retail-pricing.js';

const PROD = 'just4games.myshopify.com';
const LOCATION = '112354328849';
const PRICE_LIST = 'gid://shopify/PriceList/31546081553';
const KEYS = ['1','2','3','4','5','6','7','8','9','Clear','0','Back'];

export function safeError(error) {
  if (typeof error === 'string' && error.trim()) return error;
  if (typeof error?.message === 'string' && error.message.trim()) return error.message;
  const gql = error?.errors;
  if (Array.isArray(gql) && gql.length) return gql.map(x => x.message || String(x)).join('; ');
  return 'Unable to update the price. Check Shopify permissions and the Mont-Royal Retail Market.';
}

function UpdatePriceJ4G() {
  const item = shopify.cartLineItem;
  const session = shopify.session.currentSession;
  const shopDomain = session.shopDomain;
  const locationId = String(session.locationId);
  const allowed = shopDomain !== PROD || locationId === LOCATION;
  const variantId = Number(item?.variantId);
  const hasVariant = Number.isSafeInteger(variantId) && variantId > 0;
  const [settings, setSettings] = useState(defaultSettings());
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [tabletDevice, setTabletDevice] = useState(false);
  const [tabletOverride, setTabletOverride] = useState(null);
  const submitting = useRef(false);

  useEffect(() => {
    let active=true;
    (async () => {
      try { const cached = await loadCachedSettings(); if (active && cached) setSettings(cached); }
      catch (_) { /* cache is optional */ }
      try { const remote = await loadSettings(); if (active && remote) setSettings(remote); }
      catch (e) {
        // Production's verified Mont-Royal location and price list IDs are
        // embedded. Saving must not depend on the formats metaobject.
        if (active && shopDomain !== PROD) setError('Shared settings unavailable: '+safeError(e));
      }
    })();
    try {
      Promise.resolve(shopify.device.isTablet()).then(v => {if(active) setTabletDevice(Boolean(v));}).catch(() => {});
    } catch (_) { /* manual override available */ }
    return () => { active=false; };
  }, []);

  const tabletMode = tabletOverride === null ? tabletDevice : tabletOverride;
  const cents = parsePriceToCents(price);
  const valid = Number.isSafeInteger(cents) && cents > 0;
  const resolvedSettings = shopDomain === PROD ? {
    ...settings,
    retail: {...(settings.retail || {}), locationId: LOCATION, priceListId: PRICE_LIST},
  } : settings;

  function enter(key) {
    if (busy) return;
    setMessage(''); setError('');
    if (key === 'Clear') setPrice('');
    else if (key === 'Back') setPrice(p => deleteKeypadDigit(p));
    else setPrice(p => appendKeypadDigit(p, key));
  }

  async function savePrice() {
    if (submitting.current || !allowed || !hasVariant || !valid) return;
    submitting.current = true; setBusy(true); setError(''); setMessage('');
    try {
      // No separate Verify button is needed. This method calls
      // checkRetailPriceList() BEFORE every mutation and rejects other locations.
      const amount = await writeRetailPrice({
        settings: resolvedSettings, actualLocationId: locationId,
        shopDomain, variantId, cents,
      });
      setMessage(`Saved $${amount} CAD for Mont-Royal. Check the cart total before checkout.`);
      shopify.toast.show('Update Price J4G: saved');
    } catch (e) { setError(safeError(e)); }
    finally { setBusy(false); submitting.current = false; }
  }

  const keypad = (
    <s-stack gap="none">
      <s-heading>Price: ${price || '0.00'}</s-heading>
      {[0,1,2,3].map(row => (
        <s-stack key={row} direction="inline" gap="small-100">
          {KEYS.slice(row*3,row*3+3).map(key => (
            <s-box key={key} inlineSize={tabletMode ? '116px' : '98px'} blockSize="57px">
              <s-button variant="secondary" disabled={busy} onClick={() => enter(key)}>
                {key === 'Clear' ? 'CLR' : key === 'Back' ? '⌫' : key}
              </s-button>
            </s-box>
          ))}
        </s-stack>
      ))}
    </s-stack>
  );
  const actions = (
    <s-stack gap="base">
      {error && <s-banner tone="critical" heading={error} />}
      {message && <s-banner tone="success" heading={message} />}
      {!allowed && <s-banner tone="critical" heading="Only J4G - Mont-Royal can update this retail price." />}
      {!hasVariant && <s-banner tone="critical" heading="Select a catalog product variant." />}
      <s-button variant="primary" disabled={busy || !allowed || !hasVariant || !valid}
        loading={busy} onClick={savePrice}>Save J4G price</s-button>
      <s-text tone="subdued">The Mont-Royal catalog is checked automatically before saving. Online prices are not changed. Confirm the cart total after saving.</s-text>
    </s-stack>
  );

  return (
    <s-page heading="Update Price J4G" subheading="Mont-Royal only · Existing cart item">
      <s-button slot="secondary-actions" variant="secondary"
        onClick={() => setTabletOverride(old => old === null ? !tabletDevice : !old)}>
        {tabletMode ? 'Phone layout' : 'Tablet layout'}
      </s-button>
      <s-box padding="base">
        {tabletMode ? (
          <s-stack direction="inline" gap="base" alignItems="start">
            <s-box inlineSize="48%" minInlineSize="310px">
              <s-text type="strong">{item?.title || 'Selected cart item'}</s-text>
              <s-text>Current cart price: ${item?.price ?? '—'} · Quantity: {item?.quantity ?? 1}</s-text>
              {keypad}
            </s-box>
            <s-box inlineSize="48%" minInlineSize="285px">{actions}</s-box>
          </s-stack>
        ) : (
          <s-stack gap="small">
            <s-text type="strong">{item?.title || 'Selected cart item'}</s-text>
            {keypad}
            {actions}
          </s-stack>
        )}
      </s-box>
    </s-page>
  );
}
export default async () => {render(<UpdatePriceJ4G />, document.body);};
