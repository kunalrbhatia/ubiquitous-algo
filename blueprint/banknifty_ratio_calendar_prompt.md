# Optimized Prompt: BankNifty Ratio Calendar Spread — Angel One SmartAPI (Node.js/TypeScript)

You are an expert quantitative trading engine assistant specializing in **TypeScript (Node.js)** automation using **Angel One SmartAPI**. Design and implement a production-grade, testable, self-hosted automated pipeline for a "BankNifty Ratio Calendar Spread Option Strategy" with the logic, sequencing, infra, and operational controls below.

> **Note:** This is a separate repo/daemon from `ratio-double-calendar-daemon` (NIFTY, weekly cycle). BankNifty currently has **monthly-only** contracts — weekly BankNifty options were discontinued by NSE in November 2024. All cycle timing below is built around the monthly expiry, not the weekly Wed→Tue cycle used in the NIFTY project.

## 0. Tech Stack & Project Conventions
Same conventions as the NIFTY project, carried over as-is:
- Language: **TypeScript**, compiled via `tsc`, run under **pm2** on the Oracle Cloud VM (can share the VM with the NIFTY daemon — separate pm2 process/name, separate repo, separate `.env`).
- Package manager: **pnpm**.
- Broker: **Angel One SmartAPI** via direct REST calls using Node's **built-in `fetch`** (Node 18+). Thin `httpClient` module handling JSON parsing, timeouts via `AbortController`, retry/backoff.
- Utilities: **lodash** for data-shaping.
- Validation: **Zod** for schema validation at every external/persisted-data boundary — `.env` parsing at boot, SmartAPI responses (`placeOrder`, `getOrderBook`, margin calculator, option chain/LTP), instrument master cache, and `positions.json` reads.
- Dates/timezone: **Day.js** + `dayjs/plugin/utc` + `dayjs/plugin/timezone` (IST). Needed here for: identifying the **last Tuesday of the month** (BankNifty's current expiry day — see Section 3), monthly-cycle bookkeeping in `positions.json`, and the flag auto-clear job.
- Testing: **Jest** (`ts-jest`), **100% coverage** enforced in CI. All broker/API calls, notification senders, filesystem flag checks, margin calculations, Black-Scholes delta computation, and Day.js-based clock/expiry-day logic must be behind interfaces/mockable modules.
- Formatting/Linting: **Prettier** (check mode in CI) + **ESLint** (`@typescript-eslint`).
- Auth: `generateSession` (API key + client code + TOTP) → `jwtToken`/`refreshToken`/`feedToken`; auto-refresh via `generateTokens` before expiry.

## 1. Environment Configuration
`.env` (root, git-ignored, `.env.example` committed), parsed/validated at boot via Zod (`config/env.ts`):
```dotenv
PORT=3001
NODE_ENV=development
API_KEY=your_api_key_here
CLIENT_CODE=your_client_code_here
CLIENT_PIN=your_pin_here
CLIENT_TOTP_PIN=your_totp_pin_here
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_telegram_chat_id_here
TELEGRAM_ENABLED=true
SLACK_ENABLED=false
SLACK_WEBHOOK_URL=your_slack_webhook_url_here
SLACK_SIGNING_SECRET=your_slack_signing_secret_here
```
> Real secrets live only in the server's `.env` / GitHub Actions secrets — never committed. If sharing the VM with the NIFTY daemon, use a distinct `PORT` and a distinct pm2 process name (e.g. `banknifty-ratio-calendar`) to avoid collisions.

## 2. Instrument & Token Resolution (runs first, cached)
- Download/parse the Angel One instrument master (`OpenAPIScripMaster`) daily.
- Filter for **BANKNIFTY**, `NFO` segment, and the current **3-month trading cycle** (near/next/far month — BankNifty options only run 3 months out at any time, per NSE).
- Build the same cache map pattern as the NIFTY project: `{underlying}_{expiry}_{strike}_{optionType}` → `{ symboltoken, tradingsymbol, lotsize, exchange }`, Zod-validated on parse and on every disk-cache read.
- Split into separate **Calls** and **Puts** collections per expiry.

## 3. Underlying & Expiry Cycle
- Instrument: **BANKNIFTY** only (this repo is BankNifty-specific — no multi-underlying branching needed, unlike the NIFTY project which also had SENSEX).
- **Expiry day: last Tuesday of the month** (holiday-adjusted to the previous trading day if last Tuesday is a market holiday). This is the current NSE rule as of writing — confirm against the live NSE circular/instrument master at build time, since expiry-day rules have changed multiple times in the last two years and could change again.
- Two expiries are relevant to this strategy at any time:
  - **T0** = current month's expiry (near month).
  - **T1** = next month's expiry (next month).
- Entry condition: proceed only if **India VIX is between 10 and 13.5** (same band as the NIFTY project — adjust here if you want a BankNifty-specific band; flagging as a default carried over, not a BankNifty-verified number).

## 4. Monthly Trading Window
- **Entry**: *(assumption — needs your confirmation)* on the **first trading day after the previous month's expiry**, i.e. the day the new near-month contract is introduced (per NSE, this is "the trading day following the expiry of the near month contract"). Since T0 expiry is last Tuesday, this is typically the **Wednesday** right after. Confirm if you want a different entry day (e.g. a fixed T-1-before-T0-expiry entry, which you mentioned exploring for the NIFTY project — let me know if that maps here too).
- **Hold/monitor**: from entry through T0 expiry (last Tuesday of the current month).
- **Exit**: on stoploss hit, profit-target hit, or natural T0 expiry — whichever comes first.
- Scheduling: a **persistent pm2-managed daemon** with an internal **`node-cron`** scheduler computing "last Tuesday of month" dynamically via Day.js (do not hardcode dates) — checks day/time internally to decide entry, monitoring, or idle.

## 5. Algorithmic Entry Logic (delta + LTP based basket)

This replaces the old fixed-delta-table approach from the NIFTY project with the newer delta-band + LTP-matched hedge logic:

### 5a. T0 (near month) — Short strike selection
- For both CE and PE legs, compute delta via **Black-Scholes** (using live IV from the option chain / LTP).
- Select the strike whose **|delta| falls in the 0.10–0.15 range**.
- Strike **must** be a multiple of 100 *(confirm BankNifty's current strike interval — it has been revised periodically; validate against the live instrument master rather than assuming NIFTY's 100-point spacing carries over)*.
- **Tie-break:** if multiple strikes qualify, choose the one **nearer to 0.15 delta**.
- These are the **sold (short)** legs.

### 5b. T1 (next month) — Long hedge strike selection
- For each T0 short leg, find the T1 strike whose LTP is closest to (and within ±5% of) the T0 short leg's LTP at basket-build time.
  - Example: T0 short call LTP = 100 → target band = 95–105.
- **Fallback if nothing in band matches:** widen the search **upward only**, one strike-step at a time, accepting progressively more expensive premiums (106, 107, 108, …) until a match is found.
  - Never widen downward.
  - Cap the widen loop (e.g. 5–10 strike-steps). If no valid, liquid match is found within the cap, abort that leg and alert — do not place an unhedged or over-widened trade.
  - Apply the same liquidity check used in the NIFTY project's recent liquidity-filter fix to any T1 candidate strike.
- Apply independently for CE and PE.
- These are the **bought (long)** legs.
- Build a single in-memory **order basket** (all 4 legs — 2 short T0, 2 long T1 — resolved `symboltoken`, `tradingsymbol`, `transactiontype`, `quantity`, `exchange`) before placing any order.

## 6. Execution Sequencing (Margin-Benefit Rule)
Same buy-first, confirm-before-next pattern as the NIFTY project:
1. Split the basket into `buyLegs[]` (T1 longs) and `sellLegs[]` (T0 shorts).
2. Execute all `buyLegs` first via `placeOrder`, one at a time.
3. After each buy, poll `getOrderBook()` (or order-status/postback) until `COMPLETE`, validated via Zod. On `REJECTED`/`CANCELLED`, abort the whole entry sequence, alert, and do not proceed to sells.
4. Only after all buy legs are `COMPLETE`, execute `sellLegs[]` the same confirm-before-next way.
5. Log every order's request payload, order ID, and final status.
6. Exit reverses the logic: close short legs (buy-to-cover) before closing long legs.

## 7. Risk Management — margin-based SL and target
- Before entry, calculate **margin utilized** for the full basket via the Angel One Margin Calculator API (verify exact endpoint/payload against current SmartAPI docs at build time).
- **Compute this margin value once**, immediately after the basket position is taken, and **persist it in the monthly JSON file** (`marginUtilized` field) — never recomputed afterward, even if intraday margin requirements shift.
- **Stoploss:** basket MTM loss ≥ **1.1% of stored `marginUtilized`** → close entire basket immediately.
- **Profit target:** basket MTM profit ≥ **1.5% of stored `marginUtilized`** → close entire basket immediately.
- Continuously monitor via LTP polling or WebSocket (`feedToken`).
- Send a notification (Telegram + Slack) on either exit, with realized P&L, margin base, and legs closed.

## 8. Paper Mode & Kill Switch (filesystem-flag controlled)
Same pattern as the NIFTY project, plus one new monthly-specific flag:

- **`.paper`**: present → paper mode (simulate fills, still write to `positions.json`). Absent → live mode. Live filesystem check every tick, not just at boot.
- **`.kill`**: present → daemon pauses entirely (no new entries, exits, or modifications; read-only monitoring/logging continues). Removing it resumes immediately, no restart needed. Re-checked every scheduled tick.
- **`done-for-this-month`** *(new — monthly equivalent of the "done-for-this-week" concept)*:
  - File location: project root, same level as `.kill`/`.paper`.
  - Behavior: identical to `.kill` — blocks new trade placement **and** suspends all websocket monitoring / SmartAPI calls entirely while present.
  - **Created only** when the basket closes via stoploss (Section 7) or profit target (Section 7). Not created on manual kill or any other closure path.
  - **Auto-cleared** by a scheduled `node-cron` job (IST) on the **first trading day after T0 expiry** (i.e. the day the new near-month contract is introduced — see Section 4's entry-day logic), re-enabling trading for the next monthly cycle. Compute this date dynamically via Day.js "last Tuesday of month" logic plus holiday adjustment — do not hardcode.
- **`positions.json`**: tracks open/closed positions, **month-wise** instead of week-wise (e.g. `positions/positions-2026-07.json`, keyed by contract month), separate paths for paper vs. live (`data/paper/positions-<month>.json` vs `data/live/positions-<month>.json`). Every read validated via Zod before the daemon trusts it for entry/exit decisions.

## 9. Logging & Notifications
Same as the NIFTY project:
- Structured logger (Winston or Pino), new log file per day (`logs/2026-07-01.log`) plus console. Log every: auth event, VIX check, basket construction, delta/LTP strike selection results, each order placement/status, SL/target trigger, `.kill`/`.paper`/`done-for-this-month` state transitions, and errors.
- **Telegram**: outbound-only — order placed/filled/rejected, SL/target triggered, entry skipped (VIX out of range or already done this month), flag state changes.
- **Slack**: same event set, via `SLACK_WEBHOOK_URL`, gated by `SLACK_ENABLED`.
- Both channels independently toggleable via env flags.

## 10. Retention / Cleanup
- Daily cleanup job deletes:
  - Daily log files older than **1 month**.
  - `positions.json` month-files older than **3 months** *(assumption — adjusted up from the NIFTY project's 1 month, since BankNifty's monthly cadence means 1-month retention would delete the file almost as soon as the cycle closes; adjust if you'd prefer a different window)*.
- Never touches the current month's `positions.json` or today's log file.

## 11. CI Workflow (GitHub Actions — required before merge)
Identical pipeline to the NIFTY project:
1. **Prettier** (`--check`).
2. **ESLint**.
3. **Typecheck** (`tsc --noEmit`).
4. **Jest** with coverage, **100%** thresholds enforced.
5. **Build** (`pnpm build`).

## 12. Deploy Workflow (only on successful CI merge to `master`)
Same `workflow_run`-triggered pattern as the NIFTY project — adjust the `cd` path to the new repo's directory and use a distinct pm2 ecosystem file/process name:
```yaml
name: Deploy

on:
  workflow_run:
    workflows: ["CI"]
    types:
      - completed
    branches: [master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}

    steps:
      - name: Deploy to Oracle Cloud via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.ORACLE_HOST }}
          username: ${{ secrets.ORACLE_USER }}
          key: ${{ secrets.ORACLE_SSH_KEY }}
          script: |
            export PATH=$PATH:/home/ubuntu/.nvm/versions/node/v24.16.0/bin
            cd ~/banknifty-ratio-calendar
            git pull origin master
            pnpm install --frozen-lockfile
            pnpm build
            pm2 restart ecosystem.config.cjs --env production
```

## 13. Deliverable Structure
```
src/
  auth/                 # session generation + token refresh
  instruments/          # scrip master fetch, cache, call/put resolution (BankNifty, 3-month cycle)
  greeks/               # Black-Scholes delta computation from LTP + IV
  strategy/             # VIX check, T0 delta-band selection, T1 LTP-matched hedge search, basket builder
  execution/            # buy-first/sell-second order sequencing + confirmation polling
  risk/                 # margin calculator client, stored-margin SL/target monitor
  scheduler/            # node-cron + Day.js (IST): last-Tuesday-of-month expiry calc, entry day, monthly cleanup
  http/                 # fetch-based httpClient wrapper (timeout/retry)
  schemas/              # Zod schemas: env, SmartAPI responses, instrument cache, positions.json
  flags/                # .paper / .kill / done-for-this-month live filesystem watchers
  notify/               # Telegram + Slack senders
  logging/              # daily-rotating logger
  positions/            # month-wise positions.json read/write
__tests__/              # Jest specs mirroring src/, 100% coverage
.github/workflows/ci.yml
.github/workflows/deploy.yml
ecosystem.config.cjs
.env.example
.paper                  # (not committed; presence toggles paper mode)
.kill                   # (not committed; presence pauses the daemon)
done-for-this-month     # (not committed; presence blocks trading until auto-cleared)
```

---

## Open items to confirm before handing this to a coding agent

1. **Entry day** (Section 4): confirmed as "first trading day after T0 expiry," or do you want the T-1-before-expiry entry timing you were exploring for the NIFTY daemon applied here instead?
2. **Strike interval** (Section 5a): confirm BankNifty's current strike spacing is still 100 — worth checking the live instrument master rather than assuming parity with NIFTY.
3. **VIX band** (Section 3): carried over as 10–13.5 from the NIFTY project as a placeholder — confirm if BankNifty needs its own band given it's a different underlying with different vol characteristics.
4. **Retention window** (Section 10): 3 months suggested for month-files — confirm or adjust.
5. **Widen-cap and opposite-leg-abort behavior** (Section 5b): same open question as the NIFTY basket-logic update — if one side hits the widen cap, should the whole basket be aborted, or just that leg run unhedged? Recommend aborting the whole basket; confirm.
