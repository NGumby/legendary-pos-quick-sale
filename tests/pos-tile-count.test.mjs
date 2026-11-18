import test from 'node:test';
import assert from 'node:assert/strict';
import {countCartItemsForTile} from '../shared/pos/cart-tile-count.js';

const vendor = (title, quantity = 1) => ({
  title, quantity, properties:{
    '_J4G Sale Source':'legendary-pos-quick-sale',
    '_J4G Vendor':'Orangeade Vintage',
    '_J4G Sale Type':title,
  },
});
const quick = (title, condition, quantity = 1) => ({
  title,quantity,properties:{
    '_Quick Sale Source':'legendary-pos-quick-sale',
    '_J4G Condition':condition,
    '_J4G Sale Type':title,
  },
});

test('vendor tile badge counts only J4G Vendor items and their quantities', () => {
  const cart = {lineItems:[vendor('Orangeade - Divers',2),vendor('Pro des DVDs - T-Shirt'),quick('Used DVD','Used',4),{title:'LEGO',quantity:3}]};
  assert.equal(countCartItemsForTile(cart,'vendors'),3);
});
test('New / Used badges count items by actual cart condition regardless of which tile made the sale', () => {
  const cart={lineItems:[quick('New DVD','New',3),quick('New Vinyl','New'),quick('Used DVD','Used',2),vendor('Orangeade - Divers')]};
  assert.equal(countCartItemsForTile(cart,'condition','New'),4);
  assert.equal(countCartItemsForTile(cart,'condition','Used'),2);
});
test('fixed-format tiles show only matching J4G sale types', () => {
  const cart={lineItems:[quick('Used DVD','Used',2),quick('Used Blu-ray','Used',3),quick('New DVD','New')]};
  assert.equal(countCartItemsForTile(cart,'saleType','Used DVD'),2);
  assert.equal(countCartItemsForTile(cart,'saleType','USED BLU-RAY'),3);
  assert.equal(countCartItemsForTile(cart,'saleType','New DVD'),1);
  assert.equal(countCartItemsForTile(cart,'saleType','Used CD'),0);
});
test('badge ignores untagged catalog products and malformed quantities', () => {
  const cart={lineItems:[{title:'Used DVD',quantity:10},quick('Used DVD','Used',-5),quick('Used DVD','Used',0)]};
  assert.equal(countCartItemsForTile(cart,'saleType','Used DVD'),0);
  assert.equal(countCartItemsForTile({},'vendors'),0);
  assert.equal(countCartItemsForTile(null,'condition','New'),0);
});
