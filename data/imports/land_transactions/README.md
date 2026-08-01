# Land transactions (market comps)

Curated registered-deed / industrial transaction comps for Investor market blend.

Circle rates (`circle_rates`) = **government floor**.  
This folder = **market signal** (deed consideration ÷ area, or attributable industrial reserve prices).

### Loaded sources

| Source | Meaning |
|--------|---------|
| `hsiidc_eauction_reserve` | **Only** published HSIIDC e-auction size+reserve pairs (FY24-25 industrial schedule + Barwala commercial quote). Generate via `backend/scripts/generate-hsiidc-eauction-comps.js --import`. No estimates, no invented plot sizes. |
| `jamabandi_deed` | Curated registered-deed comps (manual; no bulk export). |

### Completeness (honest)

- Circle rates: **22/22 districts** loaded. Fatehabad Tehsil = FY2025-26; other Fatehabad tehsils + Ambala Barara = FY2023-24 until newer CollectrateReports appear.
- Market comps: attributable HSIIDC auctions only — not every district/estate. Village Jamabandi deeds are **not** inventable.

## CSV naming

```
land_transactions_<districtslug>_v1.csv
```

Example: `land_transactions_gurugram_v1.csv`

## Columns

See `land_transactions_TEMPLATE.csv`:

| Column | Required | Notes |
|--------|----------|--------|
| `district` | yes | Official name (Gurugram, Faridabad, …) |
| `tehsil` | no | |
| `village` | no | |
| `sector_type` | yes | `industrial` / `commercial` / `residential` / `agricultural` |
| `price_per_sq_yard_inr` | yes | `consideration_inr / area_sq_yards` |
| `area_sq_yards` | no | If present must be > 0 |
| `lat`, `lng` | yes | WGS84; must fall in Haryana bbox |
| `transaction_date` | yes | ISO date; importer keeps last ~5 years |
| `source` | yes | e.g. `jamabandi_deed` — never `seed_comparable` |
| `deed_id` | no | Registry / document no. |
| `consideration_inr` | no | Total deed consideration ₹ |
| `area_unit` | no | Original unit before conversion (`sqm`, `acre`, …) |
| `notes` | no | Provenance |

## Unit conversion

- `area_sq_yards = area_sq_m / 0.836127`
- 1 acre ≈ 4840 sq yd
- `price_per_sq_yard_inr = consideration_inr / area_sq_yards`

Spot-check a few rows before import.

## Import

```powershell
cd backend
# HSIIDC e-auction reserves (bulk, published):
node scripts/generate-hsiidc-eauction-comps.js --import

# Or one district / source:
node scripts/import-district-land-transactions.js Gurugram hsiidc_eauction_reserve
node scripts/import-district-land-transactions.js Gurugram jamabandi_deed
```

Idempotent: deletes prior rows for that **district + source**, then inserts.

## Quality gates (importer)

- Price ₹500–2,000,000 / sq yd
- Lat/lng inside Haryana approximate bbox
- Transaction date within ~5 years
- Source must not be `seed_comparable`

## Honest constraint

Jamabandi has **no bulk export**. Curate district-by-district from registration search / DC notices. Do not invent deed rows for demos.
