import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/StickerMenu.jsx' {
  const shopify: import('@shopify/ui-extensions/pos.cart.line-item-details.action.menu-item.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/StickerModal.jsx' {
  const shopify: import('@shopify/ui-extensions/pos.cart.line-item-details.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/logic.js' {
  const shopify: import('@shopify/ui-extensions/pos.cart.line-item-details.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/settings.js' {
  const shopify: import('@shopify/ui-extensions/pos.cart.line-item-details.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/retail-pricing.js' {
  const shopify: import('@shopify/ui-extensions/pos.cart.line-item-details.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}
