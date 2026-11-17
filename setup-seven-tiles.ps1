$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Write-QuickSaleExtension {
    param(
        [Parameter(Mandatory = $true)][string]$ExtensionPath,
        [Parameter(Mandatory = $true)][string]$SaleTitle,
        [Parameter(Mandatory = $true)][string]$EnglishName,
        [Parameter(Mandatory = $true)][string]$FrenchName
    )

    $tileTemplate = @'
import '@shopify/ui-extensions/preact';
import {render} from 'preact';

const SALE_TITLE = '__SALE_TITLE__';

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
'@

    $modalTemplate = @'
import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState} from 'preact/hooks';

const SALE_TITLE = '__SALE_TITLE__';

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
'@

    $tileCode = $tileTemplate.Replace('__SALE_TITLE__', $SaleTitle)
    $modalCode = $modalTemplate.Replace('__SALE_TITLE__', $SaleTitle)

    Set-Content -Path (Join-Path $ExtensionPath 'src\Tile.jsx') -Value $tileCode -Encoding utf8
    Set-Content -Path (Join-Path $ExtensionPath 'src\Modal.jsx') -Value $modalCode -Encoding utf8

    $en = [ordered]@{
        name = $EnglishName
        tile_subheading = 'Enter price'
        modal_subheading = 'Taxable custom sale'
        price_label = 'Price'
        price_details = 'Enter the selling price. The item title is filled automatically.'
        price_error = 'Enter a price greater than 0.'
        add_to_cart = 'Add to cart'
        added_to_cart = '{{title}} added to cart'
        add_error = 'Could not add this sale. Try again.'
    } | ConvertTo-Json

    $fr = [ordered]@{
        name = $FrenchName
        tile_subheading = 'Entrer le prix'
        modal_subheading = 'Vente personnalisée taxable'
        price_label = 'Prix'
        price_details = "Entrez le prix de vente. Le titre de l'article est rempli automatiquement."
        price_error = 'Entrez un prix supérieur à 0.'
        add_to_cart = 'Ajouter au panier'
        added_to_cart = '{{title}} ajouté au panier'
        add_error = "Impossible d'ajouter cette vente. Réessayez."
    } | ConvertTo-Json

    Set-Content -Path (Join-Path $ExtensionPath 'locales\en.default.json') -Value $en -Encoding utf8
    Set-Content -Path (Join-Path $ExtensionPath 'locales\fr.json') -Value $fr -Encoding utf8

    Write-Host "Configured $SaleTitle in $ExtensionPath" -ForegroundColor Green
}

function New-And-ConfigureQuickSale {
    param(
        [Parameter(Mandatory = $true)][string]$ExtensionName,
        [Parameter(Mandatory = $true)][string]$SaleTitle,
        [Parameter(Mandatory = $true)][string]$EnglishName,
        [Parameter(Mandatory = $true)][string]$FrenchName
    )

    $before = @(Get-ChildItem -Path '.\extensions' -Directory | ForEach-Object { $_.FullName })

    & shopify app generate extension --name "$ExtensionName" --template "pos_smart_grid"
    if ($LASTEXITCODE -ne 0) {
        throw "Shopify CLI failed while generating $ExtensionName."
    }

    $after = @(Get-ChildItem -Path '.\extensions' -Directory | ForEach-Object { $_.FullName })
    $newPaths = @($after | Where-Object { $before -notcontains $_ })

    if ($newPaths.Count -ne 1) {
        throw "Expected one new extension folder for $ExtensionName, but found $($newPaths.Count)."
    }

    Write-QuickSaleExtension -ExtensionPath $newPaths[0] -SaleTitle $SaleTitle -EnglishName $EnglishName -FrenchName $FrenchName
}

if (-not (Test-Path '.\extensions\legendary-pos-quick-sale')) {
    throw 'The existing extensions\legendary-pos-quick-sale scaffold was not found.'
}

Write-QuickSaleExtension `
    -ExtensionPath '.\extensions\legendary-pos-quick-sale' `
    -SaleTitle 'Store DVD' `
    -EnglishName 'Store DVD Quick Sale' `
    -FrenchName 'Vente rapide DVD'

$extensionsToCreate = @(
    @{ ExtensionName = 'Store Lego Quick Sale'; SaleTitle = 'Store Lego'; EnglishName = 'Store Lego Quick Sale'; FrenchName = 'Vente rapide Lego' },
    @{ ExtensionName = 'Store CD Quick Sale'; SaleTitle = 'Store CD'; EnglishName = 'Store CD Quick Sale'; FrenchName = 'Vente rapide CD' },
    @{ ExtensionName = 'Store Figurine Quick Sale'; SaleTitle = 'Store Figurine'; EnglishName = 'Store Figurine Quick Sale'; FrenchName = 'Vente rapide Figurine' },
    @{ ExtensionName = 'Store Vinyl Quick Sale'; SaleTitle = 'Store Vinyl'; EnglishName = 'Store Vinyl Quick Sale'; FrenchName = 'Vente rapide Vinyle' },
    @{ ExtensionName = 'Store Video Game Quick Sale'; SaleTitle = 'Store Video Game'; EnglishName = 'Store Video Game Quick Sale'; FrenchName = 'Vente rapide Jeu vidéo' },
    @{ ExtensionName = 'Store Other Quick Sale'; SaleTitle = 'Store Other'; EnglishName = 'Store Other Quick Sale'; FrenchName = 'Vente rapide Autre' }
)

foreach ($extension in $extensionsToCreate) {
    New-And-ConfigureQuickSale `
        -ExtensionName $extension.ExtensionName `
        -SaleTitle $extension.SaleTitle `
        -EnglishName $extension.EnglishName `
        -FrenchName $extension.FrenchName
}

Write-Host ''
Write-Host 'All seven quick-sale tiles are configured.' -ForegroundColor Cyan
Write-Host 'Next: run shopify app config validate --json, then shopify app dev to test them in Shopify POS.' -ForegroundColor Cyan
