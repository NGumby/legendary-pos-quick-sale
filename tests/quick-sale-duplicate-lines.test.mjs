import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const EXTENSIONS = [
  'quick-sale-new',
  'quick-sale-used',
  'quick-sale-other',
  'quick-sale-new-dvd',
  'quick-sale-new-bluray',
  'quick-sale-used-dvd',
  'quick-sale-used-bluray',
  'quick-sale-used-cd',
  'quick-sale-used-game',
  'quick-sale-used-vinyl',
  'legendary-pos-quick-sale',
];

function readAllocator(extension) {
  const source = readFileSync(
    new URL(`../extensions/${extension}/src/Modal.jsx`, import.meta.url),
    'utf8',
  );
  const match = source.match(/function nextUniqueCustomSaleTitle\(baseTitle, cartLines\) \{[\s\S]*?^\}/m);
  assert.ok(match, `${extension}: missing duplicate-title helper`);
  assert.match(
    source,
    /shopify\.cart\.addCustomSale\(\{\.\.\.payload\.item, title: nextUniqueCustomSaleTitle\(payload\.item\.title, shopify\.cart\.current\.value\?\.lineItems\)\}\)/,
    `${extension}: custom sale must allocate a unique title before adding the item`,
  );
  // These extension files contain JSX; evaluate only the stand-alone pure helper.
  const allocate = new Function(`${match[0]}\nreturn nextUniqueCustomSaleTitle;`)();
  return allocate;
}

for (const extension of EXTENSIONS) {
  test(`${extension}: duplicate custom sales get distinct titles`, () => {
    const title = readAllocator(extension);
    const original = [{title: 'Used DVD', price: 5.99, properties: {UPC: '000001'}}];
    assert.equal(title('Used DVD', undefined), 'Used DVD');
    assert.equal(title('Used DVD', []), 'Used DVD');
    assert.equal(title('Used DVD', original), 'Used DVD (2)');
    assert.equal(title('Used DVD', [
      ...original,
      {title: 'Used DVD (2)', price: 5.99, properties: {UPC: '000002'}},
      {title: 'Used DVD (4)', price: 9.99},
    ]), 'Used DVD (3)');
    assert.equal(title('Used DVD', [{title: 'Used Blu-ray'}]), 'Used DVD');
    assert.equal(title('Used DVD', [{title: 'Used DVD (2)'}]), 'Used DVD');
    assert.equal(title('Used DVD', [{title: 'Used DVD', price: 12}]), 'Used DVD (2)');
    assert.deepEqual(original, [{title: 'Used DVD', price: 5.99, properties: {UPC: '000001'}}]);
  });
}
