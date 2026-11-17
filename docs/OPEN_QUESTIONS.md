# Open questions

Business facts the code must not invent. Each item names who decides and where the code uses a placeholder.

## Placeholders from the brief

| Placeholder                                 | Status                                                                 | Used in                                 |
| ------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| [APP_NAME]                                  | open                                                                   | README, mobile app name, welcome screen |
| [PREMIUM_PRICE_MONTH], [PREMIUM_PRICE_YEAR] | open                                                                   | billing (phase 6)                       |
| [STT_PROVIDER]                              | open, decided by phase-0 test (≥ 90% accuracy)                         | voice (phase 2)                         |
| [LLM_PROVIDER_AND_MODEL]                    | open; Azure AI Foundry is a candidate (anonymised text only)           | voice, insights                         |
| [SMS_PROVIDER]                              | open; dev uses a console adapter                                       | auth                                    |
| [HOSTING_PROVIDER_UZ]                       | open                                                                   | infra                                   |
| [PARTNER_LIST_AND_TERMS]                    | open                                                                   | invest (phase 5)                        |
| [LINK_TO_MOCKUPS]                           | resolved: docs/design/mockups.pdf (file still to be added to the repo) | all screens                             |
| [LEGAL_REVIEW_NOTES]                        | open                                                                   | see legal section below                 |

## Product decisions

1. **Google / Apple sign-in.** The login mockup shows both buttons; the brief specifies phone + SMS OTP only. Decision for now: SMS only in the MVP, social sign-in hidden behind a feature flag. If Google is added on iOS, App Store rules require Sign in with Apple as well.
2. **Translations.** Mockups are Russian only. Uzbek (Latin) and English strings are drafted by the developer and need review by a native speaker. Reviewer: open.
3. **Onboarding questions 2 and 3** (goal, halal preference) have no mockup. Draft options are in `docs/design/NOTES.md`.
4. **OTP resend cooldown.** Mockup shows a countdown; 60 s assumed.
5. **Free vs Premium rules shown in the Premium mockup but not in the brief:** budget limits and tips Premium-only; scenario calculator Premium-only; points: lesson +10, 7-day streak +50, 30-day streak +200, month within budget +100, first investment +20 (V2); referral = +1 month Premium after the friend tracks for 7 days. To confirm before phase 6.

## Legal review

1. Portfolio screen marks one template as "your profile" and names specific partners (Way II / Asaxiy Invest) inside the allocation. Does this count as personalised investment advice under constraint 7?
2. Partner return figures ("10–15% a year") must come from admin-entered data with source and date, never from code. Who signs off on the wording?
3. Can anonymised audio and text be processed by an AI provider outside Uzbekistan (for example Azure UAE North or Central India)?
4. Is a licence needed to show investment information and model portfolios?
