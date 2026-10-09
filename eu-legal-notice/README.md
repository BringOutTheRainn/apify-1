# EU Company Legal Info Extractor

Turn a list of **company websites** into **verified company data**: the legal entity name, official registration number, VAT ID, share capital and contact email. Everything is read from the legal-notice page that EU companies are legally required to publish.

Works across **France, Italy, Spain, Netherlands, Belgium, Poland, the UK, Germany/Austria and Portugal**. You **only pay when legal data is found**.

## Use it for
- **Lead enrichment and KYB:** match a domain to a registered legal entity before you onboard, invoice or sell.
- **CRM cleanup:** add VAT and registration numbers to accounts that only have a website.
- **Supplier checks and procurement:** confirm who is really behind a webshop.

## What it finds

| Country | Registration IDs | VAT |
|---|---|---|
| France | SIREN, SIRET, RCS | FR… |
| Italy | Partita IVA, REA | IT… |
| Spain | CIF / NIF | ES… |
| Netherlands | KvK | NL…B.. |
| Belgium | KBO / BCE | BE0… |
| Poland | NIP, KRS, REGON | PL… |
| UK | Company number | GB… |
| Germany / Austria | Handelsregister (HRB/HRA) | DE… / ATU… |
| Portugal | NIPC | PT… |

It also returns the **legal name** (e.g. *Boulangerie Dupont SAS*), **share capital**, **emails**, **country** and the URL of the legal page.

```json
{
  "domain": "https://dupont.fr",
  "legalName": "Boulangerie Dupont SAS",
  "country": "FR",
  "registrationIds": { "siret": "852 379 015 00012", "siren": "852379015" },
  "vatIds": ["FR45852379015"],
  "shareCapital": "10 000",
  "emails": ["contact@dupont.fr"],
  "legalNoticeUrl": "https://dupont.fr/mentions-legales"
}
```

## How it works
1. It opens each homepage and finds the legal-notice link (*mentions légales, note legali, aviso legal, colofon, informacje prawne, impressum, legal notice…*).
2. It reads that page and the homepage footer, and pulls out IDs using country-specific patterns.
3. It returns one row per site where something was found. Sites with nothing found are **free**, and you can list them with *Also return sites with no legal data*.

It makes plain HTTP requests (1–3 pages per site), so it is fast and cheap.

## Pricing (pay per event)
- **Website with legal data found:** $0.004
- Websites with nothing found: **free**

1,000 enriched companies cost about **$4**.

## Notes
- Data comes only from the company's own public website. Named individuals (e.g. publication directors) are not returned.
- VAT numbers are extracted, not validated. Run them through VIES if you need a live check.
- Found a site it misses? Report it on the **Issues** tab and it will be added.
