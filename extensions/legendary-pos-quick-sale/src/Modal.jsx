import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState} from 'preact/hooks';

const SALE_TITLE = 'Store DVD';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const {i18n} = shopify;
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePriceInput = (event) => {
    setPrice(event.currentTarget.value);
    if (error) setError('');
  };

  const addToCart = async () => {
    const normalizedPrice = price.trim().replace(',', '.');
    const amount = Number(normalizedPrice);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError(i18n.translate('price_error'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await shopify.cart.addCustomSale({
        title: SALE_TITLE,
        quantity: 1,
        price: amount.toFixed(2),
        taxable: true,
      });

      shopify.toast.show(i18n.translate('added_to_cart', {title: SALE_TITLE}));
      window.close();
    } catch (addError) {
      console.error('Unable to add custom sale', addError);
      setError(i18n.translate('add_error'));
      setLoading(false);
    }
  };

  return (
    <s-page heading={SALE_TITLE} subheading={i18n.translate('modal_subheading')}>
      <s-scroll-box>
        <s-stack padding="base" gap="base">
          <s-number-field
            label={i18n.translate('price_label')}
            details={i18n.translate('price_details')}
            value={price}
            inputMode="decimal"
            min={0.01}
            controls="none"
            required
            error={error}
            onInput={handlePriceInput}
          />
          <s-button
            variant="primary"
            disabled={loading}
            loading={loading}
            onClick={addToCart}
          >
            {i18n.translate('add_to_cart')}
          </s-button>
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}
