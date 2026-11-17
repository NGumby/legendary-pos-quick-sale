import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/Tile.jsx' {
  const shopify: import('@shopify/ui-extensions/pos.home.tile.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/Modal.jsx' {
  const shopify: import('@shopify/ui-extensions/pos.home.modal.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/presets.js' {
  const shopify:
    | import('@shopify/ui-extensions/pos.home.tile.render').Api
    | import('@shopify/ui-extensions/pos.home.modal.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/logic.js' {
  const shopify: import('@shopify/ui-extensions/pos.home.modal.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/settings.js' {
  const shopify: import('@shopify/ui-extensions/pos.home.modal.render').Api;
  const globalThis: { shopify: typeof shopify };
}
