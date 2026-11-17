import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {ACTIVE_PRESET_ID, PRESETS} from './presets.js';
import {normalizeUpc, parsePriceToCents, appendKeypadDigit, deleteKeypadDigit, buildSale} from './logic.js';

function QuickSale() {
  const active = PRESETS.find((p) => p.id === ACTIVE_PRESET_ID) || PRESETS[0];
  const [presetId, setPresetId] = useState(active.id);
  const [chooseType, setChooseType] = useState(active.id === 'other');
  const [upc, setUpc] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [stage, setStage] = useState('scan');
  const [savedCount, setSavedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upcField = useRef(null);
  const priceField = useRef(null);
  const acceptScan = useRef(true);
  const isSubmitting = useRef(false);
  const recentScan = useRef({code: '', at: 0});

  const preset = PRESETS.find((p) => p.id === presetId) || active;

  // Scanner events work even when the native text field does not take keyboard focus.
  useEffect(() => {
    const signal = shopify.scanner.scannerData.current;
    const staleCode = normalizeUpc(signal.value?.data);
    let firstEmission = true;
    const unsubscribe = signal.subscribe((scan) => {
      const code = normalizeUpc(scan?.data);
      if (firstEmission) {
        firstEmission = false;
        if (code && code === staleCode) return; // Previous modal's buffered scan.
      }
      if (!code || !acceptScan.current || isSubmitting.current) return;
      const now = Date.now();
      if (recentScan.current.code === code && now - recentScan.current.at < 650) return;
      recentScan.current = {code, at: now};
      acceptScan.current = false; // Ignore rapid repeats until the next item.
      setUpc(code);
      setStage('price');
      setError('');
    });
    return unsubscribe;
  }, []);

  // POS web components may not implement an imperative focus method. Attempt it,
  // but keep the scanner subscription and touch price keypad as reliable fallbacks.
  useEffect(() => {
    const field = stage === 'scan' ? upcField.current : priceField.current;
    if (field && typeof field.focus === 'function') {
      try { field.focus(); } catch (_) { /* Some POS builds do not permit focus. */ }
    }
  }, [stage, savedCount]);

  function startNewItem() {
    setUpc('');
    setTitle('');
    setPrice('');
    setError('');
    setStage('scan');
    acceptScan.current = true;
  }

  function changePreset(nextId) {
    const next = PRESETS.find((p) => p.id === nextId);
    if (!next) return;
    setPresetId(nextId);
    setChooseType(false);
    setError('');
  }

  function readyForPrice() {
    acceptScan.current = false;
    setStage('price');
    setError('');
  }

  async function addItem(keepOpen) {
    if (isSubmitting.current) return;
    let payload;
    try { payload = buildSale(preset, {upc, title, price}); }
    catch (e) { setError(e.message || 'Enter a valid price.'); return; }
    isSubmitting.current = true;
    setBusy(true);
    setError('');
    let lineItemUuid = '';
    try {
      if (shopify.cart.current.value?.editable === false) {
        throw new Error('Cart cannot be edited at the moment.');
      }
      lineItemUuid = await shopify.cart.addCustomSale(payload.item);
      if (!lineItemUuid) throw new Error('Shopify did not return an item ID.');
      try {
        await shopify.cart.addLineItemProperties(lineItemUuid, payload.properties);
      } catch (metadataError) {
        // Never silently leave an untracked UPC in the cart.
        try {
          await shopify.cart.removeLineItem(lineItemUuid);
        } catch (_) {
          throw new Error('The item was added but its UPC/details were NOT saved. Remove that line from the cart before continuing.');
        }
        lineItemUuid = '';
        throw metadataError;
      }
      shopify.toast.show(`Added ${preset.label} - $${payload.item.price}`);
      setSavedCount((count) => count + 1);
      if (keepOpen) startNewItem();
      else window.close();
    } catch (e) {
      setError(e?.message || 'Could not add the item. Please try again.');
    } finally {
      isSubmitting.current = false;
      setBusy(false);
    }
  }

  const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Back'];
  return (
    <s-page heading={preset.label} subheading="Variable price - individual item tracking">
      <s-box padding="base">
        <s-stack gap="base">
          <s-stack direction="inline" alignItems="center" justifyContent="space-between" gap="small">
            <s-text>{savedCount ? `${savedCount} item(s) added` : 'Ready for next item'}</s-text>
            <s-button variant="secondary" disabled={busy} onClick={() => setChooseType((v) => !v)}>
              {chooseType ? 'Hide types' : 'Change type'}
            </s-button>
          </s-stack>

          {chooseType && (
            <s-box padding="small">
              <s-stack direction="inline" gap="small">
                {PRESETS.map((option) => (
                  <s-button key={option.id} variant={option.id === presetId ? 'primary' : 'secondary'}
                    disabled={busy} onClick={() => changePreset(option.id)}>{option.label}</s-button>
                ))}
              </s-stack>
            </s-box>
          )}

          {error && <s-banner tone="critical">{error}</s-banner>}
          <s-text>{stage === 'scan' ? 'Scan the item UPC, or skip directly to the price.' : 'Price is ready. UPC and Title are optional.'}</s-text>

          <s-text-field
            ref={upcField}
            label="UPC (optional)"
            placeholder="Scan or type barcode"
            value={upc}
            maxLength={64}
            disabled={busy}
            onInput={(event) => setUpc(event.currentTarget.value)}
          />
          <s-stack direction="inline" gap="small">
            <s-button disabled={busy} variant="secondary" onClick={() => shopify.scanner.showCameraScanner()}>
              Camera scan
            </s-button>
            <s-button disabled={busy} variant="secondary" onClick={readyForPrice}>
              {upc ? 'UPC entered - Price' : 'Skip UPC - Price'}
            </s-button>
            {upc && (
              <s-button disabled={busy} variant="secondary" onClick={() => {
                setUpc(''); setStage('scan'); acceptScan.current = true;
              }}>Rescan</s-button>
            )}
          </s-stack>

          <s-number-field
            ref={priceField}
            label="Price (CAD) - required"
            placeholder="0.00"
            inputMode="decimal"
            controls="none"
            value={price}
            error={price && parsePriceToCents(price) === null ? 'Enter a positive price (2 decimals max).' : undefined}
            disabled={busy}
            onInput={(event) => {setPrice(event.currentTarget.value); setStage('price');}}
          />

          <s-box padding="small">
            <s-stack gap="small">
              <s-text type="strong">Quick keypad: 5, 9, 9 = $5.99</s-text>
              {[0, 1, 2, 3].map((row) => (
                <s-stack key={row} direction="inline" gap="small">
                  {keypad.slice(row * 3, row * 3 + 3).map((key) => (
                    <s-button key={key} variant="secondary" disabled={busy} onClick={() => {
                      setStage('price');
                      if (key === 'Clear') setPrice('');
                      else if (key === 'Back') setPrice((old) => deleteKeypadDigit(old));
                      else setPrice((old) => appendKeypadDigit(old, key));
                    }}>{key}</s-button>
                  ))}
                </s-stack>
              ))}
            </s-stack>
          </s-box>

          <s-text-field
            label="Title (optional)"
            placeholder="Movie, artist or game title"
            value={title}
            maxLength={180}
            disabled={busy}
            onInput={(event) => setTitle(event.currentTarget.value)}
          />

          <s-stack direction="inline" gap="small">
            <s-button variant="secondary" disabled={busy || parsePriceToCents(price) === null}
              loading={busy} onClick={() => addItem(false)}>Add & Close</s-button>
            <s-button variant="primary" disabled={busy || parsePriceToCents(price) === null}
              loading={busy} onClick={() => addItem(true)}>Add & Next</s-button>
          </s-stack>
          <s-text>Records UPC, Title, Format, Condition, and Vendor on each sale line. Does not adjust catalog inventory.</s-text>
        </s-stack>
      </s-box>
    </s-page>
  );
}

export default async () => {
  render(<QuickSale />, document.body);
};
