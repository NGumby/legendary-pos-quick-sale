// Pure startup behaviour for the two condition-first Shopify POS tiles.
export const isConditionChooser = (id) => id === 'new' || id === 'used';

export function initialChooserState(seed) {
  const condition = seed?.condition === 'New' ? 'New' : 'Used';
  const chooseTypeFirst = isConditionChooser(seed?.id);
  return {
    condition,
    formatId: chooseTypeFirst ? '' : String(seed?.id || 'other').replace(/^(new|used)-/, '') || 'other',
    typeChosen: !chooseTypeFirst,
    showTypes: chooseTypeFirst || seed?.id === 'other',
  };
}
