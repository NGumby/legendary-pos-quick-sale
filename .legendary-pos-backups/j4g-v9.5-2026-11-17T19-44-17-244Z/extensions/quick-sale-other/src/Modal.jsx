// LEGENDARY-POS-V9.4-ANDROID-RENDER-RECOVERY
// LEGENDARY-POS-FORMAT-ICONS-V9.2
// LEGENDARY-POS-QUICK-SALE-V9.1
// LEGENDARY-POS-RIGHT-ACTIONS-V8
// LEGENDARY-POS-UI-V5
import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {ACTIVE_PRESET_ID, PRESETS} from './presets.js';
import {appendKeypadDigit, deleteKeypadDigit, buildSale, normalizeUpc, parsePriceToCents} from './logic.js';
import {defaultSettings, selectedFormat, presetFor, slugFormat, loadSettings, saveSettings,
  loadCachedSettings, cacheSettings, formatIcon, FORMAT_ICON_CHOICES} from './settings.js';

const KEYS = ['1','2','3','4','5','6','7','8','9','Clear','0','Back'];
const seed = PRESETS.find(x => x.id === ACTIVE_PRESET_ID) || PRESETS[0];
const startingCondition = seed.condition === 'New' ? 'New' : 'Used';
const startingFormat = seed.id.replace(/^(new|used)-/, '') || 'other';

const conditionChooser = false;
function QuickSale() {
  const [settings, setSettings] = useState(defaultSettings());
  const [condition, setCondition] = useState(startingCondition);
  const [formatId, setFormatId] = useState(startingFormat);
  const [showTypes, setShowTypes] = useState(seed.id === 'other');
  const [manage, setManage] = useState(false);
  const [editFormatId, setEditFormatId] = useState(startingFormat === 'other' ? 'dvd' : startingFormat);
  const [showFormatDetails, setShowFormatDetails] = useState(false);
  const [newFormat, setNewFormat] = useState('');
  const [newFormatIcon, setNewFormatIcon] = useState('📦');
  const [iconPickerTarget, setIconPickerTarget] = useState('');
  const [upc, setUpc] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [tabletDevice, setTabletDevice] = useState(false);
  const [tabletOverride, setTabletOverride] = useState(null);
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

  useEffect(() => {
    let active = true;
    try {
      Promise.resolve(shopify.device.isTablet())
        .then(value => { if (active) setTabletDevice(Boolean(value)); })
        .catch(() => {});
    } catch (_) { /* Manual tablet switch remains available. */ }
    return () => {active = false;};
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
        id, label: newFormat.trim().slice(0,36), icon: newFormatIcon, used: true, new: true, vendor: 'Store', taxable: true,
      }]}));
      setNewFormat(''); setNewFormatIcon('📦'); setIconPickerTarget(''); setEditFormatId(id); setConfigNotice('Unsaved changes'); setConfigError('');
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

  // Tablet devices use two native Polaris columns. The manual layout switch is
  // intentional: POS versions occasionally report the wrong device form factor.
  // On a narrow tablet, the two columns wrap instead of clipping action buttons.
  const tabletMode = tabletOverride === null ? tabletDevice : tabletOverride;
  const edit = settings.formats.find(f => f.id === editFormatId) || settings.formats[0];
  const saleDisabled = busy || !preset || parsePriceToCents(price) === null;
  const readyLabel = savedCount ? `${savedCount} added. Ready for next item` : 'Ready for next item';
  const typeSelector = (
    <s-stack gap="small">
      <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
        <s-text type="strong">{chosen ? `${formatIcon(chosen)} ` : ''}{preset?.label || `Choose a ${condition.toLowerCase()} item type`}</s-text>
        <s-button variant="secondary" disabled={busy} onClick={() => setShowTypes(v => !v)}>
          {showTypes ? 'Hide types' : 'Show types'}
        </s-button>
      </s-stack>
      {showTypes && (
        <s-stack gap="small">
          {!conditionChooser && (
            <s-stack direction="inline" gap="small">
              <s-button variant={condition === 'Used' ? 'primary' : 'secondary'}
                disabled={busy} onClick={() => changeCondition('Used')}>Used</s-button>
              <s-button variant={condition === 'New' ? 'primary' : 'secondary'}
                disabled={busy} onClick={() => changeCondition('New')}>New</s-button>
            </s-stack>
          )}
          <s-stack direction="inline" gap="small">
            {settings.formats.filter(f => condition === 'New' ? f.new : f.used).map(f => (
              <s-button key={f.id} variant={chosen?.id === f.id ? 'primary' : 'secondary'}
                disabled={busy} onClick={() => selectFormat(f.id)}>{formatIcon(f)} {f.label}</s-button>
            ))}
          </s-stack>
          <s-button variant="secondary" disabled={busy}
            onClick={() => {setManage(true); setConfigNotice('');}}>Manage formats & pricing</s-button>
        </s-stack>
      )}
    </s-stack>
  );
  const upcInput = (
    <s-text-field ref={upcField} label="UPC (optional)" placeholder="Scan or enter barcode"
      maxLength={64} value={upc} disabled={busy} onInput={e => updateUpc(e.currentTarget.value)}>
      <s-button slot="accessory" variant="secondary" disabled={busy}
        onClick={() => shopify.scanner.showCameraScanner()}>{'\u{1F4F7}'}</s-button>
    </s-text-field>
  );
  const optionalTitle = !upc.trim() && (
    <s-text-field label="Title (optional)" placeholder="Movie, game or item name"
      value={title} maxLength={180} disabled={busy}
      onInput={e => setTitle(e.currentTarget.value)}/>
  );
  // Native POS buttons retain their background and readable labels on Android.
  // A normal s-text key is intentionally smaller than the s-heading price.
  const priceKeypad = (
    <s-stack gap="small">
      <s-text type="strong">SALE PRICE (CAD)</s-text>
      <s-heading><s-text type="strong" tone="success">Price: ${price || '0.00'}</s-text></s-heading>
      {[0,1,2,3].map(row => (
        <s-stack key={row} direction="inline" gap="small" alignItems="center">
          {KEYS.slice(row * 3, row * 3 + 3).map(key => (
            <s-box key={key} inlineSize={tabletMode ? '94px' : '78px'} padding="small-100">
              <s-button variant="secondary" disabled={busy} onClick={() => pressKey(key)}>
                {key}
              </s-button>
            </s-box>
          ))}
        </s-stack>
      ))}
    </s-stack>
  );
  // These two actions are placed AFTER the scroll box, not within it.
  // This keeps them accessible when a long type list is being scrolled.
  const saleFooter = (
    <s-stack direction="inline" gap="base" justifyContent="space-between" alignItems="center">
      <s-box inlineSize="46%">
        <s-button variant="secondary" disabled={saleDisabled} loading={busy}
          onClick={() => addItem(false)}>Add & Close</s-button>
      </s-box>
      <s-box inlineSize="46%">
        <s-button variant="primary" disabled={saleDisabled} loading={busy}
          onClick={() => addItem(true)}>Add & Next</s-button>
      </s-box>
    </s-stack>
  );
  const alerts = (
    <s-stack gap="small">
      {error && <s-banner tone="critical" heading={String(error || 'Quick Sale failed')} />}
      {configError && <s-banner tone="warning" heading={String(configError || 'Shared settings unavailable')} />}
      {!preset && <s-banner tone="info" heading={`Select a ${condition.toLowerCase()} item type to begin.`} />}
    </s-stack>
  );
  // The same palette is used for existing types and new types. An icon choice
  // updates the local editor and is persisted with Save settings (not on tap).
  const renderIconPicker = (target) => (
    <s-stack gap="small">
      <s-text type="strong">Choose an icon</s-text>
      <s-stack direction="inline" gap="small">
        {FORMAT_ICON_CHOICES.map(choice => (
          <s-button key={choice.icon} variant="secondary" disabled={configBusy}
            onClick={() => {
              if (target === 'new') setNewFormatIcon(choice.icon);
              else changeFormat(target, {icon: choice.icon});
              setIconPickerTarget('');
            }}>
            {choice.icon} {choice.label}
          </s-button>
        ))}
      </s-stack>
    </s-stack>
  );
  // Format names and vendors stay behind Edit details to keep the editor compact.
  const formatList = (
    <s-stack gap="base">
      <s-text type="strong">Item types</s-text>
      <s-stack direction="inline" gap="small">
        {settings.formats.map(f => (
          <s-button key={f.id} variant={edit?.id === f.id ? 'primary' : 'secondary'}
            disabled={configBusy} onClick={() => {setEditFormatId(f.id);setShowFormatDetails(false);}}>
            {formatIcon(f)} {f.label}
          </s-button>
        ))}
      </s-stack>
      <s-stack direction="inline" gap="small" alignItems="end">
        <s-text-field label="New format" placeholder="e.g. Funko Pop" value={newFormat}
          disabled={configBusy} maxLength={36} onInput={e => setNewFormat(e.currentTarget.value)}/>
        <s-button variant="secondary" disabled={configBusy}
          onClick={() => setIconPickerTarget(old => old === 'new' ? '' : 'new')}>
          {newFormatIcon} Choose icon
        </s-button>
        <s-button disabled={configBusy || !newFormat.trim() || settings.formats.length >= 40}
          onClick={addFormat}>Add type</s-button>
      </s-stack>
      {iconPickerTarget === 'new' && renderIconPicker('new')}
    </s-stack>
  );
  const formatDetails = (
    <s-stack gap="base">
      <s-text type="strong">{edit ? `${formatIcon(edit)} ${edit.label}` : 'Select an item type'}</s-text>
      {edit && (
        <s-stack gap="base">
          <s-stack direction="inline" gap="small">
            <s-button variant={edit.used ? 'primary' : 'secondary'} disabled={configBusy}
              onClick={() => changeFormat(edit.id, {used: !edit.used})}>
              Used: {edit.used ? 'Shown' : 'Hidden'}
            </s-button>
            <s-button variant={edit.new ? 'primary' : 'secondary'} disabled={configBusy}
              onClick={() => changeFormat(edit.id, {new: !edit.new})}>
              New: {edit.new ? 'Shown' : 'Hidden'}
            </s-button>
            <s-button variant={edit.taxable ? 'primary' : 'secondary'} disabled={configBusy}
              onClick={() => changeFormat(edit.id, {taxable: !edit.taxable})}>
              {edit.taxable ? 'Taxable' : 'Non-taxable'}
            </s-button>
          </s-stack>
          <s-text color="subdued">Visibility applies to all Just4Games POS devices after saving.</s-text>
          <s-box>
            <s-button variant="secondary" disabled={configBusy}
              onClick={() => setIconPickerTarget(old => old === edit.id ? '' : edit.id)}>
              {formatIcon(edit)} Change icon
            </s-button>
          </s-box>
          {iconPickerTarget === edit.id && renderIconPicker(edit.id)}
          <s-box>
            <s-button variant="secondary" disabled={configBusy}
              onClick={() => setShowFormatDetails(v => !v)}>
              {showFormatDetails ? 'Hide details' : 'Edit details'}
            </s-button>
          </s-box>
          {showFormatDetails && (
            <s-stack gap="small">
              <s-text-field label="Format name" value={edit.label} disabled={configBusy} maxLength={36}
                onInput={e => changeFormat(edit.id, {label: e.currentTarget.value})}/>
              <s-text-field label="Vendor" value={edit.vendor} disabled={configBusy} maxLength={80}
                onInput={e => changeFormat(edit.id, {vendor: e.currentTarget.value})}/>
            </s-stack>
          )}
        </s-stack>
      )}
    </s-stack>
  );
  return (
    <s-page heading={manage ? 'J4G - Manage formats' : (conditionChooser ? `J4G - ${condition}` : (preset?.label || seed.label || 'Quick Sale'))}
      subheading={manage ? 'Configure New / Used item types' : 'Scan UPC, enter price, add to cart'}>
      <s-button slot="secondary-actions" variant={manage ? 'primary' : 'secondary'}
        disabled={manage && configBusy} loading={manage && configBusy}
        onClick={manage ? persistSettings : () => setTabletOverride(old => old === null ? !tabletDevice : !old)}>
        {manage ? 'Save settings' : (tabletMode ? 'Phone layout' : 'Tablet layout')}
      </s-button>
      <s-box padding="base">
        {manage ? (
          <s-stack gap="small">
            <s-box>
              <s-stack gap="base">
                {tabletMode ? (
                  <s-stack direction="inline" gap="base" alignItems="start">
                    <s-box inlineSize="46%" minInlineSize="260px">{formatList}</s-box>
                    <s-box inlineSize="50%" minInlineSize="280px">{formatDetails}</s-box>
                  </s-stack>
                ) : (
                  <s-stack gap="base">{formatList}{formatDetails}</s-stack>
                )}
                <s-text color="subdued">Mont-Royal location and price list settings are already configured in the app.</s-text>
              </s-stack>
            </s-box>
            {configError && <s-text type="small" tone="critical">{String(configError)}</s-text>}
            {configNotice && !configError && <s-text type="small" tone="info">{String(configNotice)}</s-text>}
            <s-divider />
            <s-box paddingBlock="base">
              <s-stack direction="inline" gap="base" justifyContent="space-between" alignItems="center">
                <s-box inlineSize="48%">
                  <s-button variant="secondary" disabled={configBusy} onClick={() => {
                    if(configNotice === 'Unsaved changes') {
                      setConfigError('Save your changes before returning to the sale.');return;
                    }
                    setManage(false);setShowTypes(false);setShowFormatDetails(false);
                  }}>Back to sale</s-button>
                </s-box>
                <s-box inlineSize="48%">
                  <s-button variant="primary" loading={configBusy} disabled={configBusy}
                    onClick={persistSettings}>Save settings</s-button>
                </s-box>
              </s-stack>
            </s-box>
          </s-stack>
        ) : (
          <s-stack gap="small">
            <s-box>
              {tabletMode ? (
                // Left: type -> UPC -> conditional Title. Right: price -> keypad.
                <s-stack direction="inline" alignItems="start" justifyContent="start" gap="base">
                  <s-box inlineSize="46%" minInlineSize="300px">
                    <s-stack gap="base">
                      {typeSelector}
                      {upcInput}
                      {optionalTitle}
                      {alerts}
                      <s-text type="strong">{readyLabel}</s-text>
                    </s-stack>
                  </s-box>
                  <s-box inlineSize="46%" minInlineSize="300px">
                    <s-stack gap="base">
                      {priceKeypad}
                    </s-stack>
                  </s-box>
                </s-stack>
              ) : (
                <s-stack gap="base">
                  {typeSelector}
                  {upcInput}
                  {optionalTitle}
                  {alerts}
                  <s-text type="strong">{readyLabel}</s-text>
                  {priceKeypad}
                </s-stack>
              )}
            </s-box>
            <s-divider />
            <s-box paddingBlock="base">
              {saleFooter}
            </s-box>
          </s-stack>
        )}
      </s-box>
    </s-page>
  );
}

export default async () => {render(<QuickSale />, document.body);};
