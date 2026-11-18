# Configurable Just4Games Quick Sale

The `J4G Vendors` home-screen smart-grid tile opens a menu of merchant-configured sale types. Use **Vendor Settings** inside its modal to add, edit, copy, disable, and reorder entries. Configurations are shared across POS devices through an app-owned Shopify metaobject (`$app:configurable_quick_sales/default`), separate from the existing New/Used format settings.

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
- The J4G Vendors sale screen shows only the selected sale type, price keypad (for variable sales), and Add buttons. UPC, item title, and the separate vendor caption are deliberately hidden; vendor/category metadata remains in private cart properties for consignment reporting.
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

Use the root script `publish-pos-version.ps1` from a **local checkout** (you can launch it from any directory). **Stage** and **Publish** automatically run `git pull --ff-only` on the current branch's configured upstream **before** reading production configuration, installing dependencies, validating, or building. Publish requires the `main` branch; Validate does not pull or alter Git. It requires Git, Node.js 22.12+, **pnpm or Corepack**, a current Shopify CLI, and Shopify authentication. By default it runs `pnpm install --frozen-lockfile` from the committed `pnpm-lock.yaml`, all `tests/*.test.mjs` tests, config validation for **both** `shopify.app.toml` and `shopify.app.production.toml`, and a production app build. Any nonzero exit code aborts the release.

```powershell
# Safe checks only; does not create a version
.\publish-pos-version.ps1

# Validate + create a new, UNRELEASED production app version
.\publish-pos-version.ps1 -Mode Stage -Version j4g-2026-11-18-01

# Validate + publish a new ACTIVE production app version
# Requires a clean Git checkout on main; publishes without prompting
.\publish-pos-version.ps1 -Mode Publish -Version j4g-2026-11-18-02
```

Omit `-Version` to generate a UTC timestamped version name for Stage/Publish. Pass `-Message '...'` to add an internal Shopify release note. `-SkipInstall` skips the frozen pnpm installation only if dependencies are already installed; it never skips tests, config validation or the build.

**Important:** `Stage` and `Publish` both create new versions. Use a different version name for each. To release the exact version already created with `Stage`, use `shopify app release --config production --version <staged-version>` instead of re-running `-Mode Publish` with its name.

The script intentionally hardcodes the reviewed **production** app identity (`Legendary POS - Just4Games`, client ID ending in `b3e8a5d`) and always uses `--config production` when building, staging or publishing. The production identity must be deliberately updated in the script if the Shopify app changes. It refuses to stage or publish with uncommitted files. Publishing additionally refuses non-`main` branches, but no longer requires a typed confirmation. The Shopify deploy command uses `--allow-updates --no-input`, so after validation it automatically releases updates without Shopify confirmation prompts. **Extension/configuration deletions are intentionally blocked** (no `--allow-deletes`), and Shopify CLI fails rather than silently deleting data. An existing Shopify CLI login is required because `--no-input` cannot open interactive authentication.

**Stage vs publish:** `Stage` runs `shopify app deploy --no-release` and does not affect the active app. To release an approved staged version later, use `shopify app release --config production --version <version>`. `Publish` runs `shopify app deploy` and activates that new version for installed stores. **Neither mode deploys an independently hosted web app.** Test the Android POS tile, saved settings, vendor metadata, and T-shirt inventory before activating production.

See [Shopify CLI app deploy](https://shopify.dev/docs/api/shopify-cli/app/app-deploy) and [Shopify CLI app config validate](https://shopify.dev/docs/api/shopify-cli/app/app-config-validate).

### Dependency installation and lockfile

This repository uses **pnpm** workspaces (15 extension packages) with `pnpm-lock.yaml` as the authoritative lockfile. The previous `package-lock.json` was outdated and could not satisfy `npm ci`; it has been removed to prevent mixed lockfiles.

The release script attempts `pnpm` first and falls back to `corepack pnpm` (included with supported Node.js releases). If neither is available, install pnpm globally with `npm install -g pnpm`. **Do not use `npm ci` for this project.**

If you add or update dependencies later, run `pnpm install` once and commit the updated `pnpm-lock.yaml`. For staging and publishing, the script always uses `--frozen-lockfile` and will refuse to resolve uncommitted dependency changes.

### Automatic Git update during Stage and Publish

The release script checks for uncommitted changes, verifies the branch has a configured upstream, then automatically runs `git pull --ff-only`. A non-fast-forward update, missing upstream, network/authentication error, or dirty checkout stops the release. It does not use `--force`, stash edits, or create a merge commit. After pulling, it rechecks the clean checkout and uses the updated source and production app config for validation and deployment.

You still need **one manual `git pull --ff-only`** to obtain a new version of the script on an existing Windows checkout. After that, `.\publish-pos-version.ps1 -Mode Publish` pulls `origin/main` (or whichever upstream your local `main` tracks) automatically. `-Mode Stage` pulls the tracked upstream of its current branch; `-Mode Validate` does not pull.

### Git working tree is not clean after validation

The release script intentionally refuses to stage or publish uncommitted source files. `Validate` can still run on a dirty checkout; it now lists the changed Git paths that need attention. `Stage` and `Publish` also list the blocking files rather than only displaying a generic error.

From the local repository, inspect first:

```powershell
git status --short
git diff
git diff --cached
```

**Do not blindly run `git reset --hard` or `git clean -fd`.** If the changes belong in the next POS version, review, commit, and push them before publishing. If the changes are local-only, use `git stash push --include-untracked -m "local changes before POS publish"` to preserve them temporarily, publish the committed `main` branch, then restore with `git stash pop` when appropriate. Stashed changes are *not* included in the Shopify version; avoid this route if they are needed for deployment. If a tool keeps changing a tracked file during validation, investigate that file rather than bypassing the safety check.

### Generated Shopify CLI files after Validate

`shopify app build` creates temporary `extensions/*/manifest.json` outputs, copies the three demo logo images from `extensions/app-home/assets/` to the extension root, and regenerates `extensions/*/shopify.d.ts` typings. Those artifacts are now ignored and the previously tracked type declarations were untracked in Git so future builds do not dirty the checkout. This change removes the generated typings from source control, **not** the actual POS extension code.

**One-time update on a checkout that was validated before this change:**

```powershell
cd D:\Git\legendary-pos-quick-sale
git diff -- extensions/legendary-pos-quick-sale/shopify.d.ts
# Only if that diff contains generated type declarations:
git restore -- extensions/legendary-pos-quick-sale/shopify.d.ts
git pull --ff-only
git status --short
.\publish-pos-version.ps1 -Mode Publish
```

The `git restore` command above discards only local edits to that one *generated* declaration file; inspect its diff first if you added custom typing code. After `git pull`, Shopify CLI will regenerate ignored type declarations on build. If `git status --short` still lists anything, review it before publishing; don't disable the publisher's clean working tree protection.

## J4G home tile count badges

All 11 J4G smart-grid tiles display a native numeric `itemCount` badge when their matching quantity in the **current POS cart** is greater than zero:

- **J4G Vendors:** totals vendor-specific sales identified by private `_J4G Sale Source` metadata (including linked Shopify product sales through this workflow).
- **J4G - New / J4G - Used:** totals new/used quick-sale units identified by `_J4G Condition` and the quick-sale source metadata.
- **Individual format tiles** (Used DVD, New DVD, etc.): totals matching `_J4G Sale Type` units sold through the existing J4G quick-sale extensions.

The badge updates when the cart changes, disappears when its count is zero, and resets with the cart after checkout. Quantities are counted, not the number of distinct lines. It is **not** a daily sales counter, total sold since opening, or inventory count. Native Shopify catalog-product tiles and third-party extensions (such as Freebees) cannot be modified through this app. The vendor's identity still appears in the product name and its private line-item properties; the separate vendor caption is removed from the sale modal.

See [Shopify POS tile's `itemCount`](https://shopify.dev/docs/api/pos-ui-extensions/2026-07/web-components/actions/tile) and [cart subscriptions](https://shopify.dev/docs/api/pos-ui-extensions/2026-10/target-apis/contextual-apis/cart-api).
