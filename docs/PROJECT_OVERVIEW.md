# Project overview

## The problem

People consistently overspend at the grocery store. Three reasons:

1. **They don't track running totals.** They get to the register and find out the bill is $200 when they expected $130.
2. **They don't know what the same item costs at competing stores.** A jar of sauce can be $18 at one chain and $24 at another, but most shoppers never find out.
3. **They forget items.** Roughly half of all grocery shoppers forget at least one thing per trip and end up making a second visit.

Existing apps each solve part of the problem but none solve all three:

- **Flipp** shows weekly circulars but only advertised prices, not what you actually pay.
- **Basket** does multi-store comparison but relies entirely on unverified user submissions.
- **Bring!** has a great list UX but no price intelligence.
- **Ibotta** does receipt scans but only for cash-back rebates, not building a price database.
- **None** support local Caribbean chains.
- **None** offer AI vision recognition (camera at the product, not the barcode).

## What we're building

SmartShopper is a mobile-first grocery app that combines:

- A clean, fast grocery list with a sticky running total
- Barcode and AI-vision product recognition
- Real-time price comparison across all supported stores
- A self-improving price database fed by user receipt scans, admin-curated circulars, and the Open Food Facts catalog
- Nutritional info available at the point of scan
- Admin-controlled store list and quality-reviewed product images

## Who it's for

**Primary:** Budget-conscious household shoppers in Trinidad & Tobago and the wider Caribbean. People who spend $100+ per grocery trip and care about getting the best deal.

**Secondary:** Casual shoppers who want a faster, smarter list app and don't necessarily care about price comparison — they get a great list experience and discover the price intelligence over time.

**Out of scope (for now):** Commercial buyers, restaurants, bulk procurement.

## Core value propositions

1. **"What does this cost everywhere?"** — Scan or tap any item, instantly see prices at every supported store.
2. **"What am I spending right now?"** — Running total updates as you shop, no surprises at the register.
3. **"What's actually in this?"** — Nutritional facts one tap away, sourced from a 3M+ product database.
4. **"This list works without an account."** — Full guest experience. Sign up only when you want to save.

## What success looks like

### MVP success (3 months post-launch)
- 1,000 active users in T&T
- 5 stores supported with reliable price data
- 10,000+ products in the database (mostly seeded from Open Food Facts)
- 500+ receipts contributed
- Crash-free rate >99.5%

### 12-month success
- 25,000 active users across the Caribbean
- 20+ supported stores
- 50,000+ products with verified prices
- Self-sustaining price database (>1,000 receipts/week)
- First monetization (featured store placements) live

## Why this can succeed

1. **Local-first focus** — No major app is targeting Caribbean grocery chains. We can own this market before global players notice.
2. **Self-reinforcing data flywheel** — More users → more receipts → better prices → more useful → more users.
3. **AI vision as a wedge** — A genuine UX advantage. Pointing your camera at a product to see comparison prices is more delightful than barcode-only scanning.
4. **Free-tier economics** — Built entirely on free tools, so unit economics work even at small scale.

## Why this could fail (risks to manage)

1. **Cold-start data problem** — Until receipts and circulars are flowing, prices will be sparse. Mitigate with admin-uploaded initial pricing for top 200 products at top 5 stores.
2. **Price staleness** — Wrong prices destroy trust. Always show "last updated" timestamps. Let users flag bad data.
3. **Store resistance** — Some chains may not love their prices being aggregated. Circulars are public, so we're legally fine, but plan for awkward conversations if we ever pursue partnerships.
4. **App quality bar** — Caribbean users have iPhones and high expectations. A laggy or crash-prone app will get one-star reviews fast. **Performance is non-negotiable.**

## North star metric

**Median number of price comparisons per active user per week.** This captures whether people actually use the differentiating feature, not just the list. If this number is high, we're delivering real value. If it's low, we're just another grocery list app.
