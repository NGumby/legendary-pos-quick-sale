import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {ACTIVE_PRESET_ID, PRESETS} from './presets.js';

function Tile() {
  const preset = PRESETS.find((item) => item.id === ACTIVE_PRESET_ID) || PRESETS[0];
  return (
    <s-tile
      heading={preset.label}
      subheading="Choose type + price"
      tone="accent"
      onClick={() => shopify.action.presentModal()}
    />
  );
}

export default async () => {
  render(<Tile />, document.body);
};
