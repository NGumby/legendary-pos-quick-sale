import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/ProductMenu.jsx' {
  const shopify: import('@shopify/ui-extensions/pos.product-details.action.menu-item.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/ProductModal.jsx' {
  const shopify: import('@shopify/ui-extensions/pos.product-details.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/ProductBlock.jsx' {
  const shopify: import('@shopify/ui-extensions/pos.product-details.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/logic.js' {
  const shopify: import('@shopify/ui-extensions/pos.product-details.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/settings.js' {
  const shopify: import('@shopify/ui-extensions/pos.product-details.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/retail-pricing.js' {
  const shopify: import('@shopify/ui-extensions/pos.product-details.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}
