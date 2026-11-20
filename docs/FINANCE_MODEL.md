# Financial model

Source: product TZ by Jahongir (Nov 11, 2026), sections 3, 10 and 11, with the corrections listed at the end. This file is part of the brief. The code lives in `packages/shared/src/finance` and must reproduce every worked example below in its tests.

All money values are integer tiyin in code; formulas below use so'm for readability. Rates are decimals (0.18 = 18%).

## 1. Inputs

| Symbol  | Meaning                                                                                                                                 | Source               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| M       | Essential monthly spending: average monthly expenses with necessity = essential over the last 3 full months                             | transactions         |
| X       | Total monthly spending: average of all expenses over the last 3 full months                                                             | transactions         |
| I       | Monthly income: average of all income (active + passive) over the last 3 full months                                                    | transactions         |
| P       | Passive monthly income: average of income-passive and dividends over the last 3 full months, as received (net)                          | transactions         |
| L       | Liquid savings: current value of assets marked liquid (card, cash, bank deposit)                                                        | assets               |
| A       | Productive assets: current value of non-liquid investment assets (Iman, Asaxiy, Way2, gold, shares, livestock, other)                   | assets               |
| D       | Liabilities: sum of outstanding liabilities                                                                                             | liabilities          |
| G       | Monthly cost of big goals: sum over the user's goals of target ÷ months to target                                                       | user goals (phase 4) |
| sources | Number of distinct income streams in the last 3 months: active counts once if any active income exists, each passive source counts once | transactions         |

"Last 3 full months" ends at the last completed calendar month in Asia/Tashkent.

Defaults to confirm (docs/OPEN_QUESTIONS.md): M uses essential only; L excludes investment platforms. Both are user-visible settings so the team can change the default without a migration.

## 2. Stages

Checked from 5 down to 1; the first rule that holds is the stage.

| Stage | Name (uz)             | Rule                                               |
| ----- | --------------------- | -------------------------------------------------- |
| 5     | Moliyaviy erkinlik    | P ≥ X + G                                          |
| 4     | Moliyaviy mustaqillik | P ≥ M                                              |
| 3     | Moliyaviy barqarorlik | L ≥ 12·M and sources ≥ 2 with at least one passive |
| 2     | Moliyaviy xavfsizlik  | L ≥ 3·M                                            |
| 1     | Moliyaviy xavf        | otherwise                                          |

"Missing for next stage", shown in so'm:

| Current | Next | Missing                                                      |
| ------- | ---- | ------------------------------------------------------------ |
| 1       | 2    | 3·M − L                                                      |
| 2       | 3    | max(12·M − L, 0), plus "add a passive income source" if none |
| 3       | 4    | monthly: M − P; capital: K(M) − A (section 5)                |
| 4       | 5    | monthly: X + G − P                                           |
| 5       | —    | nothing; show margin P − (X + G)                             |

Data sufficiency:

- With 3 or more full months of records the stage is **final**.
- With fewer, the stage is **provisional**: M and X come from the onboarding answer "average monthly spending" (with M = X until enough essential data exists), L from the onboarding answer "current savings" or the assets entered, P from records so far. The UI labels it "taxminiy" and shows how many months of data are still needed.
- With no spending figure at all, the app shows "ma'lumot yetarli emas" and no stage.

Implementation: `packages/shared/src/finance/stage.ts` (stage, KPIs, life model) and `finance/assets.ts` (positions, net worth). Until goals exist, G = 0.

## 3. KPIs

Home screen shows the first five; the monthly report shows all.

| #   | KPI                  | Formula                                                     | Default target (user-editable) |
| --- | -------------------- | ----------------------------------------------------------- | ------------------------------ |
| 1   | Net worth            | L + A − D                                                   | grows year on year             |
| 2   | Savings rate s       | (I − X) / I                                                 | 20–30%                         |
| 3   | Emergency fund R     | L / M, in months                                            | 3–6 (12 at stage 3)            |
| 4   | Passive coverage FIR | P / M                                                       | 100%                           |
| 5   | Investment share     | investments this month / income this month                  | 15–20%                         |
| 6   | Investment ROI       | (current value + dividends withdrawn − invested) / invested | real ROI > 0                   |
| 7   | Debt burden DTI      | monthly debt payments / I                                   | below 30–35% (debts phase)     |
| 8   | Debt to assets       | D / (L + A)                                                 | lower is better                |

FIR and "passive coverage" are the same number; the app shows it once.

## 4. Life model (monthly)

| #   | Model                | Rule            | Typical stage |
| --- | -------------------- | --------------- | ------------- |
| 1   | Living on debt       | s < 0           | 1             |
| 2   | Paycheck to paycheck | s ≥ 0 and R < 1 | 1             |
| 3   | Living on savings    | s > 0 and R ≥ 3 | 2–3           |
| 4   | Living on assets     | FIR ≥ 1         | 4–5           |

Checked 4 → 1. A month that fits none (for example s > 0 and 1 ≤ R < 3) is shown as model 2 with the hint "build the reserve to 3 months". The TZ marks these four definitions as a draft; they are replaceable.

## 5. Calculators

Real return (default for all capital targets): r_real = (1 + r_nominal) / (1 + π) − 1, where π is the user's inflation assumption.

Capital needed for stage 4: K = 12·M / r_year.

Months to reach K with current assets A, monthly contribution S and monthly net return i:

n = ln((K + S/i) / (A + S/i)) / ln(1 + i); n = 0 when A ≥ K. Shown as "about N months" with the return assumption visible and editable. Monthly i from yearly r: i = (1 + r)^(1/12) − 1.

Compound growth: FV = A·(1 + i)^n + S·((1 + i)^n − 1) / i; simple: A·(1 + i·n).

Rule of 72: t ≈ 72 / r[%], exact t = ln 2 / ln(1 + r); the app shows "about" and uses the exact formula for numbers.

Loan annuity (debts phase): PMT = L·i / (1 − (1 + i)^−n); total interest = n·PMT − L. Pay debt first when the after-tax debt rate exceeds the after-tax investment return.

Platform returns change month to month, so every calculator takes the return as a user-editable assumption labelled as such. The code never hardcodes a platform's return.

## 6. Worked examples (test fixtures)

All values verified; tests must reproduce them within the stated rounding.

| Case               | Inputs                                       | Expected                                             |
| ------------------ | -------------------------------------------- | ---------------------------------------------------- |
| Capital, nominal   | M = 5 000 000, r = 0.18                      | K ≈ 333 333 333                                      |
| Real return        | r = 0.18, π = 0.10                           | r_real ≈ 0.072727                                    |
| Capital, real      | M = 5 000 000, r_real as above               | K = 825 000 000                                      |
| 4% rule            | M = 5 000 000                                | 12·M·25 = 1 500 000 000                              |
| Reserve and FIR    | M = 5 000 000, L = 30 000 000, P = 1 500 000 | R = 6, FIR = 0.30                                    |
| Compound vs simple | A = 1 000 000, i = 0.014, n = 120            | simple 2 680 000; compound ≈ 5 303 400 (TZ: ≈ 5.30×) |
| Rule of 72 exact   | r = 0.18; r = 0.24                           | 4.19 years; 3.22 years                               |
| Inflation halving  | π = 0.10                                     | ≈ 7.3 years                                          |
| Annuity            | L = 10 000 000, i = 0.02, n = 12             | PMT ≈ 945 596; interest ≈ 1 347 152                  |
| Months to K        | A ≥ K                                        | n = 0                                                |

Stage fixtures (new, to cover the gap fixed below):

| L          | M         | P         | X + G     | sources | Expected                                 |
| ---------- | --------- | --------- | --------- | ------- | ---------------------------------------- |
| 10 000 000 | 5 000 000 | 0         | 6 000 000 | 1       | 1, missing 5 000 000                     |
| 40 000 000 | 5 000 000 | 0         | 6 000 000 | 1       | 2 (8 months; was unclassified in the TZ) |
| 60 000 000 | 5 000 000 | 300 000   | 6 000 000 | 2       | 3                                        |
| any        | 5 000 000 | 5 000 000 | 7 000 000 | 2       | 4, missing 2 000 000 a month             |
| any        | 5 000 000 | 8 000 000 | 7 000 000 | 2       | 5                                        |

## 7. Corrections to the TZ

1. **Stage gap.** The TZ defined stage 2 as 3–6 months and stage 3 as 12 months, so 6–12 months matched no stage and fell to stage 1 under top-down checking. Fixed: stage 2 is L ≥ 3·M.
2. **Stage needs 3 months, beta lasts 2 weeks.** The success criterion "70% see their stage" could not be met. Fixed: provisional stage from onboarding answers, labelled as provisional (section 2).
3. **Double tax.** Salary and platform dividends usually arrive with tax already withheld. Fixed: amounts are recorded as received; tax is applied only to amounts the user marks as gross. The rates in the TZ (7.5% income tax, 5% dividend tax) need confirmation by an accountant; the general personal income tax rate is believed to be 12%, with 7.5% applying to specific regimes such as IT Park.
4. **Platform return range.** The 2026 monthly range quoted in the TZ for Iman does not match the figures the team holds. No platform return is hardcoded; calculators use user-editable assumptions.
5. **Stage 5 "big goals".** Not measurable as written. Fixed: G = sum of goal target ÷ months to target, from goals the user enters.
6. **Stage 4 "monthly expense".** Read as M (essential), consistent with FIR = P / M in section 10.1 of the TZ.
