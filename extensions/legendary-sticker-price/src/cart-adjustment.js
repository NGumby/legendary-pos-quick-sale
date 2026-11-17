import {formatCents} from './logic.js';

/** Build a predictable correction plan in integer CAD cents.
 *  The Shopify POS Cart API cannot override a catalog product's unit price.
 *  A discount lowers the effective price in place. An explicit linked custom-sale
 *  adjustment can raise the cart total while keeping the product for inventory.
 */
export function planStickerAdjustment(item, targetCents) {
  if (!item?.uuid || !Number.isSafeInteger(item?.variantId) || item.variantId <= 0 || item.isGiftCard) {
    throw new Error('Choose an existing catalog product (not a custom sale or gift card).');
  }
  if (!Number.isSafeInteger(targetCents) || targetCents <= 0 || targetCents > 99999999) {
    throw new Error('Enter a valid sticker price.');
  }
  const rawUnit = Number(item.price);
  const currentCents = Math.round(rawUnit * 100);
  if (!Number.isFinite(rawUnit) || !Number.isSafeInteger(currentCents) || currentCents <= 0 || Math.abs(rawUnit * 100 - currentCents) > 0.001) {
    throw new Error('Cannot determine the original unit price in CAD.');
  }
  const quantity = Number(item.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Invalid cart quantity.');
  if (item.sellingPlan || item.requiresSellingPlan || (item.components?.length ?? 0) > 0) {
    throw new Error('Sticker adjustment is not supported for subscriptions or bundles.');
  }
  if (Array.isArray(item.discounts) && item.discounts.length > 0) {
    throw new Error('This item already has a discount. Remove or review it before applying a sticker adjustment.');
  }
  const deltaCents = targetCents - currentCents;
  return {
    kind: deltaCents < 0 ? 'discount' : deltaCents > 0 ? 'surcharge' : 'same',
    unitDifferenceCents: Math.abs(deltaCents),
    quantity,
    currentPrice: formatCents(currentCents),
    stickerPrice: formatCents(targetCents),
    amountPerUnit: formatCents(Math.abs(deltaCents)),
    totalDifference: formatCents(Math.abs(deltaCents) * quantity),
  };
}

export const ADJUSTMENT_PARENT_KEY = '_legendary_sticker_parent_uuid';
export const TARGET_PRICE_KEY = '_legendary_sticker_target_price';
export const ADJUSTMENT_VARIANT_KEY = '_legendary_sticker_variant_id';

export function findStickerAdjustment(cart, parentUuid) {
  return (cart?.lineItems || []).find(line => String(line.properties?.[ADJUSTMENT_PARENT_KEY] || '') === String(parentUuid));
}

export async function applyStickerToCart({cart, selectedUuid, targetCents}) {
  const state = cart.current.value;
  if (state?.editable === false) throw new Error('This cart is not editable.');
  const line = (state?.lineItems || []).find(l => l.uuid === selectedUuid);
  if (!line) throw new Error('Original item was changed or removed. Reopen Sticker Price.');
  const plan = planStickerAdjustment(line, targetCents);
  if (findStickerAdjustment(state, selectedUuid)) throw new Error('This product already has a sticker adjustment line. Remove it before changing the sticker price again.');
  if (plan.kind === 'same') return {plan, message:'Sticker price already matches the cart price.'};
  if (plan.kind === 'discount') {
    await cart.setLineItemDiscount(selectedUuid, 'FixedAmount', 'Sticker price correction', plan.amountPerUnit);
    return {plan, message:`Applied a $${plan.amountPerUnit} per-unit sticker discount. The original Shopify product stays in the cart.`};
  }
  // A catalog product's unit price cannot be increased in place on POS Basic.
  // Do NOT silently replace the variant with a custom sale: preserve stock/COGS.
  // An explicit adjustment is visible as a separate line on the cart/receipt.
  let extraUuid = '';
  try {
    extraUuid = await cart.addCustomSale({
      title: `Sticker adjustment - ${String(line.title || 'product').slice(0, 145)}`,
      price: plan.amountPerUnit,
      quantity: plan.quantity,
      taxable: line.taxable === true,
    });
    if (!extraUuid) throw new Error('Shopify did not add the price adjustment.');
    await cart.addLineItemProperties(extraUuid, {
      [ADJUSTMENT_PARENT_KEY]: selectedUuid,
      [ADJUSTMENT_VARIANT_KEY]: String(line.variantId),
      [TARGET_PRICE_KEY]: plan.stickerPrice,
    });
  } catch (error) {
    if (extraUuid) {
      try { await cart.removeLineItem(extraUuid); }
      catch { throw new Error('Adjustment metadata failed and cleanup failed. Check the POS cart for an extra adjustment before continuing.'); }
    }
    throw error;
  }
  return {plan, message:`Added a separate $${plan.amountPerUnit} per-unit sticker adjustment. Product stock stays linked, but the adjustment appears as a separate line on the receipt.`};
}
