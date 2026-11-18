# Configurable Just4Games Quick Sale

The `J4G Quick Sale` home-screen smart-grid tile opens a menu of merchant-configured sale types. Use **Quick Sale Settings** inside its modal to add, edit, copy, disable, and reorder entries. Configurations are shared across POS devices through an app-owned Shopify metaobject (`$app:configurable_quick_sales/default`), separate from the existing New/Used format settings.

## Starter menu

- Orangeade - Divers: custom sale; manually entered price; vendor Orangeade Vintage
- Orangeade - Friperie: custom sale; manually entered price; vendor Orangeade Vintage
- Pro des DVDs - Divers: custom sale; manually entered price; vendor Pro des DVDs
- Pro des DVDs - T-Shirt: **catalog product**, numeric variant ID `68031590891793`; price/inventory/tax remain controlled by Shopify

These entries are defaults **only if** there is no saved configuration. Do not overwrite an existing store configuration when deploying an update.

## Behavior

- Variable-price sales use the POS large cents keypad: 5,9,9 = CAD 5.99.
- Fixed-price sales add custom sale items without showing a keypad.
- Catalog-mode entries call `shopify.cart.addLineItem`, not `addCustomSale`, so the existing Shopify product's price and inventory rules apply.
- Add & Close and Add & Next attach private `_J4G Vendor`, `_J4G Category`, and `_J4G Sale Type` line-item properties, rolling back newly created items if metadata attachment fails. These properties do **not** populate Shopify's standard Product Vendor reporting automatically: vendor settlements require a separate report aggregating them.
- Optional UPC or manual Title are added as visible properties.
- Changing settings requires saving; changes are loaded by other devices when the tile next opens. A local cache may preload the screen, but the remote store configuration must load successfully before sales are enabled.
- Settings persistence checks the remote `updatedAt` field before writing to reduce accidental stale overwrites. This is not atomic concurrency control. Avoid simultaneous edits from multiple tablets.
- Shopify does not create unlimited new physical smart-grid tiles at runtime. New sale types appear as buttons inside this configurable Quick Sale menu.

## Testing and deployment

1. Run `node --test tests/configurable-quick-sales.test.mjs`.
2. Run `shopify app config validate --json` using the chosen app config.
3. Run `shopify app dev` with your development Shopify store; test on actual Android and iOS POS builds, including a T-shirt sale with inventory.
4. Deploy only after review, using the correct production config. Confirm scopes and the app-owned metaobject definition are applied, then open J4G Quick Sale once to save starter settings.
5. Test the vendor metadata on a paid test order and validate the report used to calculate money owed to each partner.

**Permissions:** The POS Settings UI does not currently enforce a staff-role restriction. Until that is implemented, only grant access to this extension to trusted POS staff. Do not rely on hiding a settings button as an authorization check.

**No live changes:** This change is proposed through a PR; it does not deploy or update any live products, prices, or inventory.

## Validate, stage and publish from Windows PowerShell

Use the root script `publish-pos-version.ps1` from a **local checkout** (you can launch it from any directory). It requires Git, Node.js 22.12+, npm, a current Shopify CLI, and Shopify authentication. By default it runs `npm ci`, all `tests/*.test.mjs` tests, config validation for **both** `shopify.app.toml` and `shopify.app.production.toml`, and a production app build. Any nonzero exit code aborts the release.

```powershell
# Safe checks only; does not create a version
.\publish-pos-version.ps1

# Validate + create a new, UNRELEASED production app version
.\publish-pos-version.ps1 -Mode Stage -Version j4g-2026-11-18-01

# Validate + publish a new ACTIVE production app version
# Requires a clean Git checkout on main and a typed confirmation
.\publish-pos-version.ps1 -Mode Publish -Version j4g-2026-11-18-01
```

Omit `-Version` to generate a UTC timestamped version name for Stage/Publish. Pass `-Message '...'` to add an internal Shopify release note. `-SkipInstall` skips `npm ci` only if dependencies are already installed; it never skips tests, config validation or the build.

The script intentionally hardcodes the reviewed **production** app identity (`Legendary POS - Just4Games`, client ID ending in `b3e8a5d`) and always uses `--config production` when building, staging or publishing. The production identity must be deliberately updated in the script if the Shopify app changes. It refuses to stage or publish with uncommitted files. Publishing additionally refuses non-`main` branches and requires the exact `PUBLISH <version>` confirmation. Shopify CLI may request its own confirmation for adding/updating/removing extensions. The script does **not** bypass these prompts or automatically allow deletions.

**Stage vs publish:** `Stage` runs `shopify app deploy --no-release` and does not affect the active app. To release an approved staged version later, use `shopify app release --config production --version <version>`. `Publish` runs `shopify app deploy` and activates that new version for installed stores. **Neither mode deploys an independently hosted web app.** Test the Android POS tile, saved settings, vendor metadata, and T-shirt inventory before activating production.

See [Shopify CLI app deploy](https://shopify.dev/docs/api/shopify-cli/app/app-deploy) and [Shopify CLI app config validate](https://shopify.dev/docs/api/shopify-cli/app/app-config-validate).
