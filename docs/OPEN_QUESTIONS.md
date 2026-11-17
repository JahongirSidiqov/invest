# Open questions

Business facts the code must not invent. Each item names who decides and where the code uses a placeholder.

## Placeholders from the brief

| Placeholder                                 | Status                                                                                          | Used in                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------- |
| [APP_NAME]                                  | open; candidates from the TZ: Bosqich, Payfirst (check Google Play and domain)                  | README, mobile app name, welcome screen |
| [PREMIUM_PRICE_MONTH], [PREMIUM_PRICE_YEAR] | open; TZ: MVP free, subscription after 100–300 users                                            | billing (phase 8)                       |
| [TAX_RATES]                                 | open; TZ says 7.5% income tax and 5% dividend tax; needs an accountant (see FINANCE_MODEL §7.3) | tax helper for amounts marked gross     |
| [STT_PROVIDER]                              | open, decided by test (≥ 90% accuracy)                                                          | voice (phase 5)                         |
| [LLM_PROVIDER_AND_MODEL]                    | open; Azure AI Foundry is a candidate (anonymised text only)                                    | voice, insights                         |
| [SMS_PROVIDER]                              | open; dev uses a console adapter                                                                | auth                                    |
| [HOSTING_PROVIDER_UZ]                       | open                                                                                            | infra                                   |
| [PARTNER_LIST_AND_TERMS]                    | open; is Iman / Asaxiy / Way2 data manual only, or is there a partnership or API?               | invest (phase 7)                        |
| [LEGAL_REVIEW_NOTES]                        | open                                                                                            | see legal section below                 |

Mockups: docs/design/mockups.pdf (file still to be added to the repo).

## Financial model (decide before phase 4)

1. **Liquid savings L.** Default: card, cash and bank deposits only; Iman, Asaxiy and other platforms count as productive assets A, not as the emergency reserve. Confirm, or should platform holdings count towards the 12-month reserve? (TZ §9)
2. **Essential spending M.** Default: "essential" only. Should "moderate" be included? (TZ §9)
3. **Provisional stage.** Proposed in FINANCE_MODEL §2 so beta users see a stage before 3 months of data. Approve the onboarding questions "current savings" and "average monthly spending".
4. **Big goals G for stage 5.** Proposed: sum of goal target ÷ months to target. Approve.
5. **Four life models.** The TZ marks its four definitions as a draft; replace if another classification was meant.
6. **Card reserve.** Default 1 000 000 so'm, user-editable; everything above it is shown as "money waiting to be invested". Confirm.

## Product decisions

1. **Google / Apple sign-in.** The login mockup shows both buttons; the brief specifies phone + SMS OTP only. Decision for now: SMS only in the MVP, social sign-in hidden behind a feature flag. If Google is added on iOS, App Store rules require Sign in with Apple as well.
2. **Translations.** Mockups are Russian only; the TZ is Uzbek. Uzbek (Latin) and English strings are drafted by the developer and need review by a native speaker. Reviewer: open.
3. **Onboarding questions 2 and 3** (goal, halal preference) have no mockup. Draft options are in `docs/design/NOTES.md`.
4. **OTP resend cooldown.** Mockup shows a countdown; 60 s assumed.
5. **Free vs Premium rules shown in the Premium mockup but not in the brief:** budget limits and tips Premium-only; scenario calculator Premium-only; points: lesson +10, 7-day streak +50, 30-day streak +200, month within budget +100, first investment +20; referral = +1 month Premium after the friend tracks for 7 days. The TZ instead puts family mode, the freedom calculator, AI and video lessons behind the subscription. To decide before phase 8.
6. **Success criteria** for the closed beta (CLAUDE.md §13) are the TZ's starting assumptions; the team confirms them.
7. **Team.** The TZ plans 5 people (Android developer, designer, ML engineer, content/marketing, project lead). Who writes the backend, and is "pech qiladigan odam" the content and marketing role?
8. **Lessons.** Who writes and films the video lessons?

## Legal review

1. Portfolio screen marks one template as "your profile" and names specific partners (Way II / Asaxiy Invest) inside the allocation. Does this count as personalised investment advice under constraint 7?
2. Partner return figures ("10–15% a year") must come from admin-entered data with source and date, never from code. Who signs off on the wording?
3. Can anonymised audio and text be processed by an AI provider outside Uzbekistan (for example Azure UAE North or Central India)?
4. Is a licence needed to show investment information, model portfolios, or the AI assistant's comparisons?
5. IMAN Invest stays out of the catalogue until cleared; users may still record their own Iman holdings.
