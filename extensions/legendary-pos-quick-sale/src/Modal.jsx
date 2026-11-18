import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {
  MAX_SALES, defaultConfig, cleanConfig, validateSale, newSaleId, saleLabel,
  priceCents, appendPriceDigit, backspacePrice, cartInstruction,
  readRemoteConfig, writeRemoteConfig, readCache, writeCache,
} from './config.js';

const KEYS = ['1','2','3','4','5','6','7','8','9','Clear','0','Back'];
const EMPTY = {id:'',title:'',description:'',vendor:'',priceMode:'variable',fixedPrice:'',variantId:'',taxable:true,enabled:true};
const copy = obj => ({...obj});
const valueOf = event => event.currentTarget.value;

function App() {
  const [config, setConfig] = useState(defaultConfig());
  const [remoteRevision, setRemoteRevision] = useState(null);
  const [ready, setReady] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [screen, setScreen] = useState('menu');
  const [selected, setSelected] = useState('');
  const [editor, setEditor] = useState(copy(EMPTY));
  const [editingId, setEditingId] = useState('');
  const [price, setPrice] = useState('');
  const [upc, setUpc] = useState('');
  const [itemTitle, setItemTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const cached = await readCache();
      if (mounted && cached) setConfig(cached);
      try {
        const server = await readRemoteConfig();
        if (!mounted) return;
        setConfig(server.config);
        setRemoteRevision(server.updatedAt);
        setInitialized(server.initialized);
        setRemoteReady(true);
        setScreen(server.initialized ? 'menu' : 'settings');
        await writeCache(server.config);
      } catch (e) {
        if (mounted) setError('Could not load shared settings. Sales and changes are blocked until Shopify reconnects. ' + (e.message || ''));
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {mounted = false;};
  }, []);

  const activeSale = config.sales.find(s => s.id === selected && s.enabled) || null;

  function edit(id) {
    const current = config.sales.find(s => s.id === id);
    setEditor(current ? copy(current) : copy(EMPTY));
    setEditingId(current ? current.id : '');
    setError('');
    setScreen('edit');
  }
  function applyEdit() {
    try {
      if (!editor.id && config.sales.length >= MAX_SALES) throw new Error('Maximum of 40 sale types.');
      const candidate = validateSale({
        ...editor,id:editingId || newSaleId(editor.title,editor.description,config.sales),
      });
      const sales = editingId
        ? config.sales.map(s => s.id === editingId ? candidate : s)
        : [...config.sales,candidate];
      const next = cleanConfig({...config,sales});
      setConfig(next); setDirty(true); setNotice('Unsaved changes');
      setError(''); setScreen('settings');
    } catch (e) {setError(e.message || String(e));}
  }
  function alter(id,patch) {
    try {
      setConfig(old => cleanConfig({...old,sales:old.sales.map(s => s.id === id ? {...s,...patch} : s)}));
      setDirty(true); setNotice('Unsaved changes'); setError('');
    } catch (e) {setError(e.message || String(e));}
  }
  function move(id,delta) {
    setConfig(old => {
      const list = [...old.sales];
      const index = list.findIndex(s => s.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= list.length) return old;
      [list[index],list[target]] = [list[target],list[index]];
      return {...old,sales:list};
    });
    setDirty(true); setNotice('Unsaved changes');
  }
  function duplicate(sale) {
    if (config.sales.length >= MAX_SALES) {setError('Maximum of 40 sale types.');return;}
    const draft = {...sale,id:'',description:sale.description+' Copy'};
    setEditor(draft);setEditingId('');setScreen('edit');setError('');
  }
  async function save() {
    if (!remoteReady || busy) return;
    setBusy(true);setError('');setNotice('');
    try {
      const saved = await writeRemoteConfig(config,remoteRevision);
      setConfig(saved.config);setRemoteRevision(saved.updatedAt);
      setInitialized(true);setDirty(false);
      await writeCache(saved.config);
      setNotice('Saved to Shopify. Other POS tablets will load these settings when opened.');
      setScreen('settings');
    } catch (e) {
      setError('Not saved: '+(e.message || String(e)));
    } finally {setBusy(false);}
  }
  async function refresh() {
    if (busy || dirty) {setError('Save your changes or reopen the tile before refreshing.');return;}
    setBusy(true);setError('');
    try {
      const remote = await readRemoteConfig();
      setConfig(remote.config);setRemoteRevision(remote.updatedAt);
      setRemoteReady(true);setInitialized(remote.initialized);
      await writeCache(remote.config);
      setNotice('Configuration refreshed.');
    } catch(e) {setError(e.message || String(e));} finally {setBusy(false);}
  }
  function openSale(id) {
    if (dirty) {setError('Save or discard settings before selling.');return;}
    setSelected(id);setPrice('');setUpc('');setItemTitle('');
    setNotice('');setError('');setScreen('sell');
  }
  function press(key) {
    if (busy) return;
    if (key === 'Clear') setPrice('');
    else if (key === 'Back') setPrice(old => backspacePrice(old));
    else setPrice(old => appendPriceDigit(old,key));
  }
  async function add(keepOpen) {
    if (!activeSale || submitLock.current || !remoteReady || dirty) return;
    let payload;
    try {payload = cartInstruction(activeSale,price);} catch(e) {setError(e.message);return;}
    submitLock.current = true;setBusy(true);setError('');
    let uuid = '';
    try {
      if (shopify.cart.current.value?.editable === false) throw new Error('Cart is not editable.');
      const properties = {
        ...payload.properties,
        ...(upc.trim() ? {UPC:upc.trim().slice(0,64)} :
          itemTitle.trim() ? {Title:itemTitle.trim().slice(0,180)} : {}),
      };
      if (payload.method === 'variant') {
        // Product price, tax, availability and inventory are managed by Shopify.
        uuid = await shopify.cart.addLineItem(payload.variantId,1);
        if (!uuid) throw new Error('Product could not be added (stock confirmation may have been dismissed).');
        try {await shopify.cart.addLineItemProperties(uuid,properties);}
        catch(metadataError) {
          try {await shopify.cart.removeLineItem(uuid);uuid='';}
          catch {throw new Error('Product was added without vendor properties. Remove it manually before retrying.');}
          throw metadataError;
        }
      } else {
        uuid = await shopify.cart.addCustomSale(payload.item);
        if (!uuid) throw new Error('Shopify did not return a cart item identifier.');
        try {await shopify.cart.addLineItemProperties(uuid,properties);}
        catch(metadataError) {
          try {await shopify.cart.removeLineItem(uuid);uuid='';}
          catch {throw new Error('Sale was added without vendor properties. Remove it manually before retrying.');}
          throw metadataError;
        }
      }
      shopify.toast.show('Added '+saleLabel(activeSale));
      setPrice('');setUpc('');setItemTitle('');
      if (!keepOpen) window.close();
    } catch(e) {setError(e.message || 'Could not add sale.');}
    finally {setBusy(false);submitLock.current=false;}
  }
  const alerts = (
    <s-stack gap="small">
      {error && <s-banner tone="critical" heading={error}/>}
      {notice && <s-banner tone="info" heading={notice}/>}
    </s-stack>
  );
  const settingsView = (
    <s-stack gap="base">
      <s-heading>Quick Sale Settings</s-heading>
      {!initialized && <s-banner tone="info" heading="First-time setup: review the sample sale types, then Save settings."/>}
      <s-text color="subdued">Manage sale types for all Just4Games POS tablets. New types appear in the Quick Sale menu without a redeploy.</s-text>
      {config.sales.map((s,i) => (
        <s-box key={s.id} padding="small" borderWidth="base" borderRadius="base">
          <s-stack gap="small">
            <s-text type="strong">{saleLabel(s)}</s-text>
            <s-text color="subdued">{s.vendor} | {s.priceMode === 'catalog' ? 'Shopify product' : s.priceMode === 'fixed' ? '$'+s.fixedPrice : 'Enter price'}</s-text>
            <s-stack direction="inline" gap="small">
              <s-button variant="secondary" disabled={busy} onClick={() => edit(s.id)}>Edit</s-button>
              <s-button variant="secondary" disabled={busy} onClick={() => alter(s.id,{enabled:!s.enabled})}>
                {s.enabled ? 'Disable' : 'Enable'}
              </s-button>
              <s-button variant="secondary" disabled={busy} onClick={() => duplicate(s)}>Copy</s-button>
              <s-button variant="secondary" disabled={busy || i===0} onClick={() => move(s.id,-1)}>Up</s-button>
              <s-button variant="secondary" disabled={busy || i===config.sales.length-1} onClick={() => move(s.id,1)}>Down</s-button>
            </s-stack>
          </s-stack>
        </s-box>
      ))}
      <s-button variant="secondary" disabled={busy || config.sales.length>=MAX_SALES} onClick={() => edit('')}>+ Add sale type</s-button>
      <s-stack direction="inline" gap="base">
        <s-button variant="primary" disabled={!ready || !remoteReady || busy || (!dirty && initialized)} loading={busy} onClick={save}>Save settings</s-button>
        <s-button variant="secondary" disabled={busy || dirty} onClick={refresh}>Refresh</s-button>
        <s-button variant="secondary" disabled={busy || dirty || !initialized} onClick={() => {setScreen('menu');setError('');}}>Quick Sale menu</s-button>
      </s-stack>
    </s-stack>
  );
  const editorView = (
    <s-stack gap="base">
      <s-heading>{editingId ? 'Edit sale type' : 'Create sale type'}</s-heading>
      <s-text-field label="Title" value={editor.title} maxLength={48} onInput={e=>setEditor(x=>({...x,title:valueOf(e)}))}/>
      <s-text-field label="Description / category" value={editor.description} maxLength={60} onInput={e=>setEditor(x=>({...x,description:valueOf(e)}))}/>
      <s-text-field label="Vendor" value={editor.vendor} maxLength={80} onInput={e=>setEditor(x=>({...x,vendor:valueOf(e)}))}/>
      <s-text>Pricing</s-text>
      <s-stack direction="inline" gap="small">
        {['variable','fixed','catalog'].map(mode => (
          <s-button key={mode} variant={editor.priceMode===mode?'primary':'secondary'} onClick={()=>setEditor(x=>({...x,priceMode:mode}))}>
            {mode==='variable'?'Enter price':mode==='fixed'?'Fixed price':'Shopify product'}
          </s-button>
        ))}
      </s-stack>
      {editor.priceMode==='fixed' && <s-text-field label="Fixed price (CAD)" inputMode="decimal" value={editor.fixedPrice} onInput={e=>setEditor(x=>({...x,fixedPrice:valueOf(e)}))}/>}
      {editor.priceMode==='catalog' && (
        <s-stack gap="small">
          <s-text-field label="Shopify variant numeric ID" value={editor.variantId} inputMode="numeric" onInput={e=>setEditor(x=>({...x,variantId:valueOf(e)}))}/>
          <s-text color="subdued">Adds the existing Shopify product at its current catalog price. Its Shopify inventory and tax settings apply.</s-text>
        </s-stack>
      )}
      {editor.priceMode!=='catalog' && (
        <s-button variant={editor.taxable?'primary':'secondary'} onClick={()=>setEditor(x=>({...x,taxable:!x.taxable}))}>
          {editor.taxable?'Taxable':'Non-taxable'}
        </s-button>
      )}
      <s-button variant={editor.enabled?'primary':'secondary'} onClick={()=>setEditor(x=>({...x,enabled:!x.enabled}))}>
        {editor.enabled?'Enabled':'Disabled'}
      </s-button>
      <s-stack direction="inline" gap="base">
        <s-button variant="primary" onClick={applyEdit}>Apply changes</s-button>
        <s-button variant="secondary" onClick={()=>{setScreen('settings');setError('');}}>Cancel</s-button>
      </s-stack>
      <s-text color="subdued">Apply changes updates this editor only. Tap Save settings on the next screen to share with all tablets.</s-text>
    </s-stack>
  );
  const menuView = (
    <s-stack gap="base">
      <s-heading>Choose a sale type</s-heading>
      <s-stack direction="inline" gap="small">
        {config.sales.filter(s=>s.enabled).map(s => (
          <s-button key={s.id} variant="secondary" disabled={busy || !remoteReady} onClick={()=>openSale(s.id)}>
            {saleLabel(s)} {s.priceMode==='catalog'?'(Product)':s.priceMode==='fixed'?'($'+s.fixedPrice+')':''}
          </s-button>
        ))}
      </s-stack>
      {!config.sales.some(s=>s.enabled) && <s-text>No enabled sale types. Open Settings to add one.</s-text>}
      <s-button variant="secondary" onClick={()=>{setScreen('settings');setError('');setNotice('');}}>⚙ Quick Sale Settings</s-button>
    </s-stack>
  );
  const saleView = activeSale && (
    <s-stack gap="base">
      <s-heading>{saleLabel(activeSale)}</s-heading>
      <s-text color="subdued">Vendor: {activeSale.vendor}</s-text>
      {activeSale.priceMode==='variable' && (
        <s-stack gap="small">
          <s-heading>Price: ${price||'0.00'} CAD</s-heading>
          {[0,1,2,3].map(row => (
            <s-stack key={row} direction="inline" gap="small">
              {KEYS.slice(row*3,row*3+3).map(key => (
                <s-box key={key} inlineSize="90px" blockSize="60px">
                  <s-button variant="secondary" disabled={busy} onClick={()=>press(key)}>
                    {key==='Clear'?'CLR':key==='Back'?'⌫':key}
                  </s-button>
                </s-box>
              ))}
            </s-stack>
          ))}
        </s-stack>
      )}
      {activeSale.priceMode==='fixed' && <s-heading>Price: ${activeSale.fixedPrice} CAD</s-heading>}
      {activeSale.priceMode==='catalog' && <s-text>Shopify product: current catalog price and available inventory</s-text>}
      <s-text-field label="UPC (optional)" value={upc} maxLength={64} onInput={e=>{setUpc(valueOf(e));if(valueOf(e))setItemTitle('');}}/>
      {!upc.trim() && <s-text-field label="Item title (optional)" value={itemTitle} maxLength={180} onInput={e=>setItemTitle(valueOf(e))}/>}
      <s-stack direction="inline" gap="base">
        <s-button variant="secondary" disabled={busy} onClick={()=>{setScreen('menu');setError('');}}>Back</s-button>
        <s-button variant="secondary" loading={busy} disabled={busy || (activeSale.priceMode==='variable' && priceCents(price)===null)} onClick={()=>add(false)}>Add & Close</s-button>
        <s-button variant="primary" loading={busy} disabled={busy || (activeSale.priceMode==='variable' && priceCents(price)===null)} onClick={()=>add(true)}>Add & Next</s-button>
      </s-stack>
    </s-stack>
  );
  return (
    <s-page heading="J4G Quick Sale" subheading="Configurable vendor sales">
      <s-scroll-box>
        <s-stack padding="base" gap="base">
          {alerts}
          {!ready && <s-text>Loading shared settings…</s-text>}
          {ready && !remoteReady && <s-button variant="secondary" onClick={()=>window.close()}>Close</s-button>}
          {ready && remoteReady && (screen==='settings'?settingsView:screen==='edit'?editorView:screen==='sell'?saleView:menuView)}
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}

export default async () => {render(<App/>,document.body);};
