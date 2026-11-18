import '@shopify/ui-extensions/preact';
import {render} from 'preact';

function Tile() {
  return (
    <s-tile
      heading="J4G Quick Sale"
      subheading="Vendor sales + settings"
      tone="accent"
      onClick={() => shopify.action.presentModal()}
    />
  );
}

export default async () => {render(<Tile/>,document.body);};
