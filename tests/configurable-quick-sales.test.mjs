import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultConfig, cleanConfig, newSaleId, priceCents, appendPriceDigit,
  backspacePrice, cartInstruction, cartProperties, validateSale,
} from '../extensions/legendary-pos-quick-sale/src/config.js';

test('four starter categories including the existing T-shirt catalog variant', () => {
  const config = defaultConfig();
  assert.equal(config.sales.length,4);
  assert.deepEqual(config.sales.map(s=>s.priceMode),['variable','variable','variable','catalog']);
  assert.equal(config.sales[3].variantId,'68031590891793');
});
test('variable sales use keypad cents and keep vendor metadata', () => {
  const sale = defaultConfig().sales[0];
  let price = '';
  for (const key of ['5','9','9']) price = appendPriceDigit(price,key);
  assert.equal(price,'5.99');
  const built = cartInstruction(sale,price);
  assert.equal(built.method,'custom');
  assert.equal(built.item.price,'5.99');
  assert.equal(built.item.title,'Orangeade - Divers');
  assert.equal(built.properties['_J4G Vendor'],'Orangeade Vintage');
  assert.equal(backspacePrice('5.99'),'0.59');
});
test('fixed price independent of checkout keypad', () => {
  const sale = {...defaultConfig().sales[0],priceMode:'fixed',fixedPrice:'12.99'};
  assert.equal(cartInstruction(sale,'2.00').item.price,'12.99');
});
test('catalog variant uses product inventory and price, preserving vendor metadata', () => {
  const built=cartInstruction(defaultConfig().sales[3],'');
  assert.equal(built.method,'variant');
  assert.equal(built.variantId,68031590891793);
  assert.equal(built.properties['_J4G Category'],'T-Shirt');
});
test('validation rejects invalid, duplicated, and empty titles', () => {
  assert.equal(priceCents('0'),null);
  assert.equal(priceCents('12.345'),null);
  assert.equal(priceCents('4,99'),499);
  assert.throws(()=>validateSale({...defaultConfig().sales[0],vendor:''}),/Vendor/);
  const same=defaultConfig().sales[0];
  assert.throws(()=>cleanConfig({sales:[same,{...same,id:'different'}]}),/Duplicate title/);
});
test('IDs stay unique and do not rewrite prior entries', () => {
  const current=defaultConfig().sales;
  assert.equal(newSaleId('Orangeade','Divers',current),'orangeade-divers-2');
  assert.equal(cartProperties(current[2],{upc:'000001'})['UPC'],'000001');
});
