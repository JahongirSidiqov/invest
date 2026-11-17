# Design notes

Mockups: `docs/design/mockups.pdf` (17 screens, Russian). Screens and states that the mockups do not cover are designed from the tokens in the brief, section 10, and listed here for designer review.

## Not in the mockups

| Screen                              | Approach                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| PIN setup and PIN entry             | 4 dots, numeric keypad with 56 px keys, biometric button on entry screen                                  |
| Lock screen after 5 min inactivity  | same as PIN entry                                                                                         |
| Onboarding questions 2 and 3        | same layout as question 1                                                                                 |
| Error, empty and loading states     | inline message in `info` / `danger` colours                                                               |
| Stage card on Home and stage detail | needs design (TZ core): current stage 1–5, "missing for next stage" in so'm and months, provisional label |
| Home KPIs                           | needs design: net worth, savings rate, emergency fund months, passive coverage, investment share          |
| Quick manual entry                  | needs design: type, amount, category, necessity level (essential / moderate / non-essential)              |
| Assets and net worth                | needs design: list by type, invested vs current value, dividend method, liabilities                       |
| Monthly report                      | needs design: income, spending by necessity, investments, savings rate, net worth, life model             |
| Onboarding: savings and spending    | two extra questions for the provisional stage, same layout as question 1                                  |

## Draft onboarding options (need approval)

- Q1 income (from mockup): up to 3 mln · 3–6 mln · 6–10 mln · over 10 mln · prefer not to say.
- Q2 main goal (draft): track spending · build a safety cushion · save for a purchase · start investing · pay off debts or nasiya.
- Q3 halal preference (draft): only halal options · halal preferred · no preference.

## Deviations from the mockups

- Login: Google and Apple buttons are hidden in the MVP (feature flag `socialLogin`), see OPEN_QUESTIONS #1.
- Invest: the "Buy in the app" block (gold, stocks, crypto) is hidden in the MVP (feature flag `purchases`).
