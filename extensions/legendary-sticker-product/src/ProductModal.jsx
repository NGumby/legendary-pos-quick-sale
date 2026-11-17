// LEGENDARY-POS-RIGHT-ACTIONS-V8
import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {appendKeypadDigit, deleteKeypadDigit, parsePriceToCents} from './logic.js';
import {defaultSettings, loadCachedSettings, loadSettings} from './settings.js';
import {checkRetailPriceList, writeRetailPrice} from './retail-pricing.js';

// Internal, verified Just4Games catalog mapping. Never render these IDs.
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

// Shopify or browser/native promise rejections can be Error, object or string.
// Always provide a real message; POS s-banner displays only its heading prop.
export function explainStickerError(error) {
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim();
  if (Array.isArray(error?.errors) && error.errors.length) {
    const messages = error.errors.map(e => e?.message || e?.description || String(e)).filter(Boolean);
    if (messages.length) return messages.join('; ');
  }
  if (typeof error?.description === 'string' && error.description.trim()) return error.description.trim();
  if (error?.cause && error.cause !== error) return explainStickerError(error.cause);
  try {
    const encoded = JSON.stringify(error);
    if (encoded && encoded !== '{}' && encoded !== 'null') return encoded;
  } catch (_) { /* no details available */ }
  return 'Shopify did not return error details. Check network access, app permissions and the Retail Market catalog.';
}

function ProductStickerPrice() {
  const variantId = Number(shopify.product?.variantId);
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
  const [tabletDevice, setTabletDevice] = useState(false);
  const [tabletOverride, setTabletOverride] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cached = await loadCachedSettings();
        if (active && cached) setSettings(cached);
      } catch (_) { /* cached formats are optional */ }
      try {
        const saved = await loadSettings();
        if (active && saved) setSettings(saved);
      } catch (e) {
        if (active && shopDomain !== PRODUCTION_SHOP) {
          setError('Cannot load store settings: ' + explainStickerError(e));
        }
      }
    })();
    return () => {active = false;};
  }, []);

  useEffect(() => {
    let active = true;
    try {
      Promise.resolve(shopify.device.isTablet())
        .then(value => {if (active) setTabletDevice(Boolean(value));})
        .catch(() => {});
    } catch (_) { /* user can toggle the tablet layout manually */ }
    return () => {active = false;};
  }, []);

  const tabletMode = tabletOverride === null ? tabletDevice : tabletOverride;
  const cents = parsePriceToCents(price);
  const valid = Number.isSafeInteger(cents) && cents > 0;
  const resolved = effectiveStickerSettings(settings, shopDomain);

  function pressKey(key) {
    if (busy) return;
    setVerified(false);
    setError('');
    setMessage('');
    if (key === 'Clear') setPrice('');
    else if (key === 'Back') setPrice(old => deleteKeypadDigit(old));
    else setPrice(old => appendKeypadDigit(old, key));
  }

  async function verify() {
    if (busy || !hasVariant || !atMontRoyal) return;
    setBusy(true); setVerified(false); setError(''); setMessage('');
    try {
      await checkRetailPriceList(resolved, locationId, shopDomain);
      setVerified(true);
      setMessage('Mont-Royal Retail Market verified for this location.');
    } catch (e) {
      setError('Verification failed: ' + explainStickerError(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (busy || !hasVariant || !atMontRoyal || !verified || !valid) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const amount = await writeRetailPrice({
        settings: resolved,
        actualLocationId: locationId,
        shopDomain,
        variantId,
        cents,
      });
      setVerified(false);
      setMessage(`Saved $${amount} CAD for Mont-Royal only. A product already in the cart must be removed and rescanned to use the new catalog price.`);
      shopify.toast.show('Mont-Royal sticker price saved');
    } catch (e) {
      setError('Could not save price: ' + explainStickerError(e));
    } finally {
      setBusy(false);
    }
  }

  const warnings = (
    <s-stack gap="small">
      {!atMontRoyal && <s-banner tone="critical" heading="Price editing is available at Mont-Royal only." />}
      {!hasVariant && <s-banner tone="critical" heading="Select a catalog product variant before setting its price." />}
      {error && <s-banner tone="critical" heading={error} />}
      {message && <s-banner tone="info" heading={message} />}
    </s-stack>
  );
  const keypad = (
    <s-stack gap="small">
      <s-heading><s-text type="strong" tone="success">Sticker price: ${price || '0.00'} CAD</s-text></s-heading>
      {[0,1,2,3].map(row => (
        <s-stack key={row} direction="inline" gap="small">
          {KEYS.slice(row * 3, row * 3 + 3).map(key => (
            <s-clickable key={key} disabled={busy} onClick={() => pressKey(key)}>
              <s-box inlineSize={tabletMode ? '88px' : '68px'} blockSize={tabletMode ? '66px' : '54px'}
                padding="small">
                <s-stack direction="block" alignItems="center" justifyContent="center" gap="none"
                  blockSize={tabletMode ? '52px' : '40px'}>
                  <s-heading>{key}</s-heading>
                </s-stack>
              </s-box>
            </s-clickable>
          ))}
        </s-stack>
      ))}
    </s-stack>
  );
  const actions = (
    <s-stack gap="base">
      {warnings}
      <s-button variant="secondary" disabled={busy || !hasVariant || !atMontRoyal}
        loading={busy} onClick={verify}>Verify Mont-Royal catalog</s-button>
      <s-button variant="primary" disabled={busy || !hasVariant || !atMontRoyal || !verified || !valid}
        loading={busy} onClick={save}>Save Mont-Royal price</s-button>
      <s-text>Verification is required before saving. Only the Mont-Royal Retail Market catalog price is changed; the online price stays unchanged.</s-text>
    </s-stack>
  );

  return (
    <s-page heading="Mont-Royal sticker price" subheading="Location-only product price">
      <s-button slot="secondary-actions" variant="secondary"
        onClick={() => setTabletOverride(old => old === null ? !tabletDevice : !old)}>
        {tabletMode ? 'Phone layout' : 'Tablet layout'}
      </s-button>
      <s-box padding="base">
        <s-stack gap="base">
          {tabletMode ? (
            // Left column: quick price keypad. Right column: ALL actions and status.
            <s-stack direction="inline" alignItems="start" justifyContent="start" gap="base">
              <s-box inlineSize="47%" minInlineSize="320px">
                <s-stack gap="base">
                  <s-text type="strong">Selected Shopify catalog product</s-text>
                  {keypad}
                </s-stack>
              </s-box>
              <s-box inlineSize="47%" minInlineSize="300px">{actions}</s-box>
            </s-stack>
          ) : (
            <s-stack gap="base">
              <s-text type="strong">Selected Shopify catalog product</s-text>
              {warnings}
              {keypad}
              <s-button variant="secondary" disabled={busy || !hasVariant || !atMontRoyal}
                loading={busy} onClick={verify}>Verify Mont-Royal catalog</s-button>
              <s-button variant="primary" disabled={busy || !hasVariant || !atMontRoyal || !verified || !valid}
                loading={busy} onClick={save}>Save Mont-Royal price</s-button>
              <s-text>Only the Mont-Royal catalog price changes. Online pricing is not affected.</s-text>
            </s-stack>
          )}
          <s-box blockSize="72px" />
        </s-stack>
      </s-box>
    </s-page>
  );
}

export default async () => { render(<ProductStickerPrice />, document.body); };
