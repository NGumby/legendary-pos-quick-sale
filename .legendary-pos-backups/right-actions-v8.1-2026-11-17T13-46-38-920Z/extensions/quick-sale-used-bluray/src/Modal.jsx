// LEGENDARY-POS-UI-V5
import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {ACTIVE_PRESET_ID, PRESETS} from './presets.js';
import {appendKeypadDigit, deleteKeypadDigit, buildSale, normalizeUpc, parsePriceToCents} from './logic.js';
import {defaultSettings, selectedFormat, presetFor, slugFormat, loadSettings, saveSettings,
  loadCachedSettings, cacheSettings} from './settings.js';

const KEYS = ['1','2','3','4','5','6','7','8','9','Clear','0','Back'];
const seed = PRESETS.find(x => x.id === ACTIVE_PRESET_ID) || PRESETS[0];
const startingCondition = seed.condition === 'New' ? 'New' : 'Used';
const startingFormat = seed.id.replace(/^(new|used)-/, '') || 'other';

function QuickSale() {
  const [settings, setSettings] = useState(defaultSettings());
  const [condition, setCondition] = useState(startingCondition);
  const [formatId, setFormatId] = useState(startingFormat);
  const [showTypes, setShowTypes] = useState(seed.id === 'other');
  const [manage, setManage] = useState(false);
  const [editFormatId, setEditFormatId] = useState(startingFormat === 'other' ? 'dvd' : startingFormat);
  const [newFormat, setNewFormat] = useState('');
  const [upc, setUpc] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [configBusy, setConfigBusy] = useState(false);
  const [error, setError] = useState('');
  const [configError, setConfigError] = useState('');
  const [configNotice, setConfigNotice] = useState('');
  const upcField = useRef(null);
  const acceptScan = useRef(true);
  const isSubmitting = useRef(false);
  const recentScan = useRef({code: '', at: 0});

  const chosen = selectedFormat(settings, formatId, condition);
  const preset = chosen ? presetFor(settings, chosen.id, condition) : null;

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Local cache ensures fast startup if the store loses connectivity;
      // the Shopify metaobject remains the authoritative cross-device source.
      const cached = await loadCachedSettings();
      if (mounted && cached) setSettings(cached);
      try {
        const remote = await loadSettings();
        if (mounted) {
          setSettings(remote);
          setConfigError('');
        }
        await cacheSettings(remote);
      } catch (e) {
        if (mounted) setConfigError('Shared settings unavailable: ' + (e.message || 'Check app permissions.'));
      }
    })();
    return () => {mounted = false;};
  }, []);

  useEffect(() => {
    const signal = shopify.scanner.scannerData.current;
    const oldCode = normalizeUpc(signal.value?.data);
    let firstEvent = true;
    const unsubscribe = signal.subscribe(scan => {
      const code = normalizeUpc(scan?.data);
      if (firstEvent) {
        firstEvent = false;
        if (code && code === oldCode) return;
      }
      if (!code || !acceptScan.current || isSubmitting.current) return;
      const now = Date.now();
      if (recentScan.current.code === code && now - recentScan.current.at < 650) return;
      recentScan.current = {code, at: now};
      acceptScan.current = false;
      setUpc(code);
      setTitle('');
      setError('');
      // NEVER focus the native price field. There is no native price field:
      // the only price input is the large on-screen quick keypad below.
      try {upcField.current?.blur?.();} catch (_) { /* no-op on older POS */ }
    });
    return unsubscribe;
  }, []);

  // Preserve UPC-first entry while avoiding a second keyboard/focus transition.
  useEffect(() => {
    try {upcField.current?.focus?.();} catch (_) { /* Native POS focus varies by build. */ }
  }, [savedCount]);

  function changeCondition(next) {
    setCondition(next);
    const f = selectedFormat(settings, formatId, next);
    if (f) setFormatId(f.id);
  }
  function selectFormat(next) {
    if (selectedFormat(settings, next, condition)?.id !== next) return;
    setFormatId(next);
    setShowTypes(false);
    setError('');
  }
  function updateUpc(value) {
    const next = String(value ?? '');
    setUpc(next);
    // Do not retain an old manually entered title once a barcode is supplied.
    if (next.trim()) setTitle('');
    setError('');
  }
  function pressKey(key) {
    if (busy) return;
    acceptScan.current = false;
    if (key === 'Clear') setPrice('');
    else if (key === 'Back') setPrice(old => deleteKeypadDigit(old));
    else setPrice(old => appendKeypadDigit(old, key));
  }
  function resetItem() {
    setUpc(''); setTitle(''); setPrice(''); setError('');
    acceptScan.current = true;
  }
  function changeFormat(id, patch) {
    setSettings(old => ({...old, formats: old.formats.map(f => f.id === id ? {...f, ...patch} : f)}));
    setConfigNotice('Unsaved changes');
  }
  function addFormat() {
    try {
      const id = slugFormat(newFormat, settings);
      setSettings(old => ({...old, formats: [...old.formats, {
        id, label: newFormat.trim().slice(0,36), used: true, new: true, vendor: 'Store', taxable: true,
      }]}));
      setNewFormat(''); setEditFormatId(id); setConfigNotice('Unsaved changes'); setConfigError('');
    } catch (e) {setConfigError(e.message);}
  }
  async function persistSettings() {
    if (configBusy) return;
    setConfigBusy(true); setConfigError(''); setConfigNotice('');
    try {
      const saved = await saveSettings(settings);
      setSettings(saved); await cacheSettings(saved);
      setConfigNotice('Saved to Shopify: all POS devices will load these settings.');
    } catch (e) {
      setConfigError('Settings not saved: ' + (e.message || String(e)));
    } finally {setConfigBusy(false);}
  }

  async function addItem(keepOpen) {
    if (isSubmitting.current || !preset) return;
    let payload;
    try {payload = buildSale(preset, {upc, title: upc.trim() ? '' : title, price});}
    catch (e) {setError(e.message); return;}
    isSubmitting.current = true; setBusy(true); setError('');
    let uuid = '';
    try {
      if (shopify.cart.current.value?.editable === false) throw new Error('Cart is not editable.');
      uuid = await shopify.cart.addCustomSale(payload.item);
      if (!uuid) throw new Error('Shopify did not return a line item UUID.');
      try {await shopify.cart.addLineItemProperties(uuid, payload.properties);}
      catch (metadataError) {
        try {await shopify.cart.removeLineItem(uuid); uuid = '';}
        catch {throw new Error('Sale added without UPC/details. Manually remove it from the cart.');}
        throw metadataError;
      }
      shopify.toast.show(`Added ${preset.label} $${payload.item.price}`);
      setSavedCount(v => v + 1);
      if (keepOpen) resetItem(); else window.close();
    } catch (e) {setError(e.message || 'Could not add sale.');}
    finally {isSubmitting.current = false; setBusy(false);}
  }

  const edit = settings.formats.find(f => f.id === editFormatId) || settings.formats[0];
  return (
    <s-page heading={preset?.label || 'Quick Sale'} subheading="Scan UPC, tap the quick keypad, add to cart">
      <s-box padding="base">
        <s-stack gap="base">
          <s-stack direction="inline" alignItems="center" justifyContent="space-between" gap="small">
            <s-text>{savedCount ? `${savedCount} added. Ready for next item` : 'Ready for next item'}</s-text>
            <s-button disabled={busy || manage} variant="secondary" onClick={() => setShowTypes(v => !v)}>
              {showTypes ? 'Hide types' : 'Show types'}
            </s-button>
          </s-stack>
          {showTypes && !manage && (
            <s-stack gap="small">
              <s-stack direction="inline" gap="small">
                <s-button variant={condition === 'Used' ? 'primary' : 'secondary'} onClick={() => changeCondition('Used')}>Used</s-button>
                <s-button variant={condition === 'New' ? 'primary' : 'secondary'} onClick={() => changeCondition('New')}>New</s-button>
              </s-stack>
              <s-stack direction="inline" gap="small">
                {settings.formats.filter(f => condition === 'New' ? f.new : f.used).map(f => (
                  <s-button key={f.id} variant={chosen?.id === f.id ? 'primary' : 'secondary'}
                    disabled={busy} onClick={() => selectFormat(f.id)}>{f.label}</s-button>
                ))}
              </s-stack>
              <s-button variant="secondary" disabled={busy} onClick={() => {setManage(true);setConfigNotice('');}}>Manage formats & pricing</s-button>
            </s-stack>
          )}

          {manage ? (
            <s-stack gap="base">
              <s-text type="strong">Store-wide formats and Mont-Royal pricing</s-text>
              {configError && <s-banner tone="critical">{configError}</s-banner>}
              {configNotice && <s-banner tone="info">{configNotice}</s-banner>}
              <s-stack direction="inline" gap="small">
                {settings.formats.map(f => (
                  <s-button key={f.id} variant={edit?.id === f.id ? 'primary' : 'secondary'}
                    onClick={() => setEditFormatId(f.id)}>{f.label}</s-button>
                ))}
              </s-stack>
              {edit && (
                <s-stack gap="small">
                  <s-text-field label="Format name" value={edit.label} maxLength={36}
                    onInput={e => changeFormat(edit.id, {label: e.currentTarget.value})}/>
                  <s-text-field label="Vendor" value={edit.vendor} maxLength={80}
                    onInput={e => changeFormat(edit.id, {vendor: e.currentTarget.value})}/>
                  <s-stack direction="inline" gap="small">
                    <s-button variant={edit.used ? 'primary' : 'secondary'} onClick={() => changeFormat(edit.id, {used: !edit.used})}>
                      Used {edit.used ? 'shown' : 'hidden'}
                    </s-button>
                    <s-button variant={edit.new ? 'primary' : 'secondary'} onClick={() => changeFormat(edit.id, {new: !edit.new})}>
                      New {edit.new ? 'shown' : 'hidden'}
                    </s-button>
                    <s-button variant={edit.taxable ? 'primary' : 'secondary'} onClick={() => changeFormat(edit.id, {taxable: !edit.taxable})}>
                      {edit.taxable ? 'Taxable' : 'Non-taxable'}
                    </s-button>
                  </s-stack>
                </s-stack>
              )}
              <s-stack direction="inline" gap="small">
                <s-text-field label="New format" placeholder="e.g. Funko Pop" value={newFormat}
                  onInput={e => setNewFormat(e.currentTarget.value)}/>
                <s-button disabled={!newFormat.trim() || settings.formats.length >= 40} onClick={addFormat}>Add format</s-button>
              </s-stack>
              <s-text type="strong">Mont-Royal location-only product prices (requires POS Pro Retail Market)</s-text>
              <s-text type="strong">Mont-Royal catalog preconfigured</s-text>
              <s-text type="small">Location: 112354328849 | Price list: 31546081553 (CAD)</s-text>
              <s-text type="small">Sticker Price verifies that the retail price list is exclusive to this location before saving any product prices.</s-text>
              <s-stack direction="inline" gap="small">
                <s-button variant="primary" loading={configBusy} disabled={configBusy} onClick={persistSettings}>Save settings</s-button>
                <s-button variant="secondary" onClick={() => {setManage(false);setShowTypes(false);}}>Back to sale</s-button>
              </s-stack>
            </s-stack>
          ) : (
            <s-stack gap="base">
              {error && <s-banner tone="critical">{error}</s-banner>}
              {configError && <s-banner tone="warning">{configError}</s-banner>}
              <s-text-field ref={upcField} label="UPC (optional)" placeholder="Scan or enter barcode"
                maxLength={64} value={upc} disabled={busy} onInput={e => updateUpc(e.currentTarget.value)}>
                <s-button slot="accessory" variant="secondary" disabled={busy}
                  onClick={() => shopify.scanner.showCameraScanner()}>{'\u{1F4F7}'}</s-button>
              </s-text-field>
              <s-stack gap="small">
                <s-heading><s-text type="strong" tone="success">Price: ${price || '0.00'}</s-text></s-heading>
                {[0,1,2,3].map(row => (
                  <s-stack key={row} direction="inline" gap="small">
                    {KEYS.slice(row * 3, row * 3 + 3).map(key => (
                      <s-button key={key} variant="secondary" disabled={busy} onClick={() => pressKey(key)}>{key}</s-button>
                    ))}
                  </s-stack>
                ))}
              </s-stack>
              {!upc.trim() && (
                <s-text-field label="Title (optional)" placeholder="Movie, game or item name"
                  value={title} maxLength={180} disabled={busy}
                  onInput={e => setTitle(e.currentTarget.value)}/>
              )}
              <s-stack direction="inline" gap="small">
                <s-button variant="secondary" disabled={busy || !preset || parsePriceToCents(price) === null}
                  loading={busy} onClick={() => addItem(false)}>Add & Close</s-button>
                <s-button variant="primary" disabled={busy || !preset || parsePriceToCents(price) === null}
                  loading={busy} onClick={() => addItem(true)}>Add & Next</s-button>
              </s-stack>
            </s-stack>
          )}
        </s-stack>
      </s-box>
    </s-page>
  );
}

export default async () => {render(<QuickSale />, document.body);};
