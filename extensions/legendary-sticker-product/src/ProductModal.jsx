// LEGENDARY-POS-RIGHT-ACTIONS-V8
import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {appendKeypadDigit, deleteKeypadDigit, parsePriceToCents} from './logic.js';
import {defaultSettings, loadCachedSettings, loadSettings} from './settings.js';
import {readRetailPrice, writeRetailPrice} from './retail-pricing.js';

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
  const [currentPrice, setCurrentPrice] = useState(null);
  const [loadingPrice, setLoadingPrice] = useState(true);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [tabletDevice, setTabletDevice] = useState(false);
  const [tabletOverride, setTabletOverride] = useState(null);

  async function refreshPrice() {
    if (!hasVariant || !atMontRoyal) { setLoadingPrice(false); return; }
    setLoadingPrice(true);
    try {
      const current = await readRetailPrice({priceListId: MONT_ROYAL_PRICE_LIST_ID, variantId});
      setCurrentPrice(current);
    } catch (e) {
      setError('Unable to load current price: ' + explainStickerError(e));
    } finally { setLoadingPrice(false); }
  }

  useEffect(() => { refreshPrice(); }, [variantId, locationId, shopDomain]);

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
    setError('');
    setMessage('');
    if (key === 'Clear') setPrice('');
    else if (key === 'Back') setPrice(old => deleteKeypadDigit(old));
    else setPrice(old => appendKeypadDigit(old, key));
  }

  async function save() {
    if (saving.current || busy || !hasVariant || !atMontRoyal || !valid) return;
    saving.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const amount = await writeRetailPrice({
        settings: resolved,
        actualLocationId: locationId,
        shopDomain,
        variantId,
        cents,
      });
      setCurrentPrice({amount, source: 'Mont-Royal sticker price', title: currentPrice?.title || ''});
      setPrice('');
      setMessage(`Saved ${amount} CAD for Mont-Royal only. Check the cart total before checkout.`);
      shopify.toast.show('Mont-Royal sticker price saved');
    } catch (e) {
      setError('Could not save price: ' + explainStickerError(e));
    } finally {
      setBusy(false);
      saving.current = false;
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
  const priceSummary = (
    <s-stack gap="small">
      <s-text type="strong">{currentPrice?.title || 'Selected Shopify catalog product'}</s-text>
      <s-text>{loadingPrice ? 'Loading current price…' :
        currentPrice ? 'Current Mont-Royal price: $' + currentPrice.amount + ' CAD' : 'Current price unavailable'}</s-text>
      {currentPrice && <s-text tone="subdued">{currentPrice.source}</s-text>}
    </s-stack>
  );
  const keypad = (
    <s-stack gap="none">
      <s-heading>New sticker price: ${'$'}{price || '0.00'}</s-heading>
      {[0,1,2,3].map(row => (
        <s-stack key={row} direction="inline" gap="small-100">
          {KEYS.slice(row * 3, row * 3 + 3).map(key => (
            <s-box key={key} inlineSize={tabletMode ? '116px' : '98px'} blockSize="57px">
              <s-button variant="secondary" disabled={busy} onClick={() => pressKey(key)}>
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
      {warnings}
      <s-button variant="primary" disabled={busy || !hasVariant || !atMontRoyal || !valid}
        loading={busy} onClick={save}>Save J4G price</s-button>
      <s-text tone="subdued">The Mont-Royal catalog is verified automatically when saving. Online pricing is unchanged.</s-text>
    </s-stack>
  );

  return (
    <s-page heading="Update Price J4G" subheading="Mont-Royal only · Scanned product">
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
                  {priceSummary}
                  {keypad}
                </s-stack>
              </s-box>
              <s-box inlineSize="47%" minInlineSize="300px">{actions}</s-box>
            </s-stack>
          ) : (
            <s-stack gap="base">
              {priceSummary}
              {keypad}
              {actions}
            </s-stack>
          )}
          <s-box blockSize="72px" />
        </s-stack>
      </s-box>
    </s-page>
  );
}

export default async () => { render(<ProductStickerPrice />, document.body); };
