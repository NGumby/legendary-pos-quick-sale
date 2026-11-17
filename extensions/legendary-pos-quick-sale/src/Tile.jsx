import '@shopify/ui-extensions/preact';
import {render} from 'preact';

const SALE_TITLE = 'Store DVD';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const {i18n} = shopify;

  return (
    <s-tile
      heading={SALE_TITLE}
      subheading={i18n.translate('tile_subheading')}
      onClick={() => shopify.action.presentModal()}
    />
  );
}
