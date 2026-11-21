# TrackRank tax readiness — November 21, 2026

Status: **not cleared for live checkout**. Edwin confirmed no sales-tax registrations.
Stripe Tax settings being active does not itself register the business. Automatic
tax remains off; no tax registration or tax filing was created by this rollout.

## Washington is the first review, not a blanket remote-seller exemption

TrackRank's operator works from Seattle. That suggests Washington physical-presence
nexus may apply; confirm the actual contracting entity, operating locations and
existing UBI/My DOR account before deciding collection obligations. Do not apply
the remote-seller $100,000 threshold as an exemption for a Washington-based seller.
Washington identifies software-as-a-service/digital automated services and remote
access software as retail-sale categories. This makes Washington treatment a real
launch question, not a flag to mark reviewed merely because the first invoice is
small. Product classification, customer sourcing, exemptions, existing entity
registrations and the proposed sales territory still need an actual determination.

Primary sources checked:

- [DOR physical-presence nexus](https://dor.wa.gov/education/industry-guides/physical-presence-nexus).
- [Current IT services guidance distinguishing SaaS and remote-access software](https://dor.wa.gov/taxes-rates/information-technology-services).
- [WAC 458-20-15502, remote-access software](https://app.leg.wa.gov/Wac/default.aspx?cite=458-20-15502).
- [DOR registration/business-license application](https://dor.wa.gov/open-business/apply-business-license).
- [Remote-seller rules](https://dor.wa.gov/taxes-rates/retail-sales-tax/marketplace-fairness-leveling-playing-field/remote-sellers) are a separate nexus analysis, not a substitute for the physical-presence review.

## Concrete next actions

1. Edwin/accountant confirms the selling entity, UBI, operating address and launch
   customer geography; establish whether an existing Washington tax account needs
   updating versus a new application. This work has not collected EIN/SSN/UBI or
   logged into My DOR, and cannot attest to a legal registration on the owner's behalf.
2. Complete any required actual state registration and retain its effective date.
   Review non-Washington jurisdictions based on actual nexus and product treatment;
   there is no single USA-wide sales-tax registration.
3. Configure Stripe's matching actual registration, business address and correct
   product tax code, then verify exclusive-price tax/address behavior in sandbox.
   Review B&O/reporting obligations separately from checkout sales-tax calculation.
4. Only after the decision is documented set BILLING_TAX_REVIEWED=true. If using
   Stripe automatic tax, verify active settings/registrations and set
   STRIPE_TAX_READY=true and STRIPE_AUTOMATIC_TAX=true. Keep the $10 base price
   exclusive of tax. Do not make up a tax code, registration date or exemption.
5. Complete the real-account production acceptance gates, then enable checkout
   for a controlled real-card trial. The first paid charge is 14 days later unless
   canceled, not at signup; no live charge has been made by this setup.
