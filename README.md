# Banknifty Monthly Calendar Spread Option Strategy Daemon

A production-grade, testable, self-hosted automated options trading pipeline built with **TypeScript (Node.js)** for executing and managing a **Monthly Calendar Spread** strategy on **BANKNIFTY** monthly contracts via the **Angel One SmartAPI**. The strategy is designed to run once and exit, invoked at regular intervals (e.g., every 30 minutes during market hours) via a system cron job.

---

## 📋 Strategy Overview

The daemon automates a **Monthly Calendar Spread** specifically tailored for BankNifty monthly contracts:

- **BANKNIFTY Schedule:**
  - **Entry Window:** Basket construction and order execution happen on the **first trading day after the previous month's expiry** (typically Wednesday).
  - **Hold & Monitor:** Monitor positions through the expiry of the current month (`T0`).
  - **Exit Window:** Natural exit occurs on the last Tuesday of the month at 15:15 PM IST.
- **Expiry Rules:** Expiry day is the **last Tuesday of the month**, dynamically adjusted to the previous trading day if the Tuesday falls on a market holiday.
- **VIX Entry Filter:** Entry is only allowed if **India VIX is between 10.0 and 13.5** at entry time.
- **Liquidity Screening:** Strikes are screened in real-time. An option contract is considered liquid only if:
  1. The Last Traded Price (LTP) is positive.
  2. The relative bid-ask spread `(Ask - Bid) / LTP` is within **8%**.
  3. The LTP is aligned with the midpoint: `|LTP - (Ask + Bid) / 2| / LTP` is within **8%**.
  4. Order book has at least `2 * lotsize` bid/ask quantity at the best quote level.
- **Exit Rules:** Positions are closed immediately on Stoploss breach (**1.5%** of utilized margin) or Profit Target reach (**2.0%** of utilized margin).

### Basket Structure

The strategy consists of a 4-leg options basket:

| Action   | Expiry            | Type | Target                                                  |
| :------- | :---------------- | :--: | :------------------------------------------------------ |
| **SELL** | $T_0$ (Near Month)| Call | $\sim 0.15$ Delta (range $[0.10, 0.15]$, closest to $0.15$) |
| **SELL** | $T_0$ (Near Month)| Put  | $\sim 0.15$ Delta (range $[0.10, 0.15]$, closest to $0.15$) |
| **BUY**  | $T_1$ (Next Month)| Call | LTP-matched to $T_0$ Short CE (closest premium match)   |
| **BUY**  | $T_1$ (Next Month)| Put  | LTP-matched to $T_0$ Short PE (closest premium match)   |

---

## 🛠️ Tech Stack & Conventions

- **Runtime & Environment:** Node.js (18+), compiled via `tsc`.
- **Package Manager:** `pnpm`.
- **Broker Integration:** **Angel One SmartAPI** via REST endpoints (LTP is queried directly via API endpoints instead of WebSockets).
- **Validation:** **Zod** schemas validate all boundaries (`.env` configurations, API responses, instrument cache, and `positions.json` state).
- **Time & Dates:** **Day.js** (configured with UTC and IST timezone plugins) for schedules, expiry tracking, and age cleanup.
- **Testing:** **Jest** (`ts-jest`) with **100% test coverage** (branches, functions, lines, statements) enforced in CI.
- **Linting & Formatting:** **ESLint** and **Prettier**.

---

## 📁 Project Structure

```text
.
├── .github/
│   └── workflows/
│       ├── ci.yml              # CI workflow (Lint, Format, Types, Tests, Build)
│       └── deploy.yml          # Auto-deployment on merge to master
├── src/
│   ├── auth/                   # Session generation & token refresh logic
│   ├── instruments/            # Instrument scrip master parser & cache mapping
│   ├── strategy/               # VIX filters, delta matching, & basket builder
│   ├── execution/              # Margin-benefit execution sequencing
│   │   ├── brokerClient.ts     # SmartAPI REST client
│   │   └── executionManager.ts # Order sequencing, P&L monitoring, entry/exit
│   ├── risk/                   # Margin calculator & stoploss/profit target monitors
│   ├── scheduler/              # Helper jobs (monthly schedule tracking and daily cleanup)
│   ├── flags/                  # paper/kill/done-for-this-month filesystem watchers
│   ├── http/                   # HTTP client wrapper with AbortController timeout & retry
│   ├── logging/                # Daily rotating winston logs
│   ├── notify/                 # Telegram and Slack alert notifications
│   ├── positions/              # positionsStore JSON reader/writer (keyed by month)
│   ├── schemas/                # Zod schemas validating API payloads & inputs
│   └── index.ts                # Strategy execution entrypoint (run-and-exit tick)
├── __tests__/                  # Unit tests (100% coverage target)
└── tsconfig.json               # TypeScript configuration
```

---

## ⚙️ Setup & Commands

### 1. Installation
Install the project dependencies using `pnpm`:
```bash
pnpm install
```

### 2. Environment Setup
Create a `.env` file in the root directory:
```bash
cp .env.example .env
```
Fill in your Angel One SmartAPI credentials and Telegram/Slack credentials.

### 3. Execution Commands
- **Run in Development (Single Tick):**
  ```bash
  pnpm dev
  ```
- **Build TypeScript:**
  ```bash
  pnpm build
  ```
- **Run Compiled Single Tick:**
  ```bash
  pnpm start
  ```
- **Run Tests with Coverage:**
  ```bash
  pnpm test
  ```
- **Check Formatting & Linting:**
  ```bash
  pnpm verify
  ```

### 4. Production Scheduling
Because the strategy is a monthly strategy, monitoring is handled by scheduling a single run-and-exit tick every 30 minutes during market hours (Mon-Fri, 09:15 to 15:30 IST) via a system cron job.

Example crontab configuration:
```cron
*/30 9-15 * * 1-5 cd /path/to/ubiquitous-algo && pnpm start >> /path/to/ubiquitous-algo/logs/cron.log 2>&1
```

---

## 🚦 Controls

The daemon's behavior can be dynamically controlled via filesystem flags in the root directory:
* **`.paper`**: If present, the daemon operates in Paper Trading mode (simulates order fills). If absent, it operates in Live Trading mode.
* **`.kill`**: If present, the daemon pauses all execution activity and remains idle.
* **`done-for-this-month`**: Automatically created when a target or stoploss exit is reached. While present, the daemon pauses all trades. It is automatically cleared on the next cycle's entry day.
