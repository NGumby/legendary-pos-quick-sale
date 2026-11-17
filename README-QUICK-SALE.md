# Legendary POS Quick Sale tiles

The existing POS UI extension is configured as **Store DVD**.

To create the remaining six separate Smart Grid tiles using Shopify CLI (so each extension receives its own Shopify-generated UID), run this from the app root in PowerShell:

```powershell
.\setup-seven-tiles.ps1
```

The script calls `shopify app generate extension` six times for:

- Store Lego
- Store CD
- Store Figurine
- Store Vinyl
- Store Video Game
- Store Other

Each generated extension is then configured with the same workflow:

1. Tap the category tile.
2. Enter a variable price.
3. Tap **Add to cart**.
4. A taxable custom sale is added with the category title already filled in.

The script does **not** deploy the app. After it finishes, validate and preview:

```powershell
shopify app config validate --json
shopify app dev
```

When testing, confirm the tax shown on the cart matches the store's configured tax settings before using the workflow for live sales.
