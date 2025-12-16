# DOLAR APP - Banking System

React Native banking app with concurrent balance management using optimistic locking.

**Peninsula Technical Test - Fullstack**

## Tech Stack

- React Native + Expo
- TypeScript
- Supabase (PostgreSQL + Auth)
- NativeWind (Tailwind CSS)

## Get Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env.local` and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

Required variables:
```
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_KEY=your-supabase-service-key  # Only for tests
```

### 3. Run database migrations

Apply the SQL migrations in `supabase/migrations/` to your Supabase project:
- `001_banking.sql` - Core banking schema and functions

### 4. Start the app

```bash
npm start          # Start Expo dev server
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run web        # Web browser
```

## Running Concurrency Tests

The project includes a test suite that validates the optimistic locking implementation.

### Prerequisites

- `SUPABASE_SERVICE_KEY` in your `.env.local` (service role key from Supabase Dashboard → Settings → API)

### Run tests

```bash
npx tsx scripts/test-concurrency.ts
```

### Test Cases

| Test | Description | Success Criteria |
|------|-------------|------------------|
| **Concurrent Deposits** | 20 parallel deposits of 10 EUR | Final balance = 200 EUR exactly |
| **Mixed Operations** | 15 deposits + 15 withdrawals concurrently | Balance >= 0 |
| **Overdraft Prevention** | 10 withdrawals from 50 EUR balance | Balance = 0, never negative |

### Expected Output

```
========================================
  CONCURRENCY TESTS - Banking System
========================================

--- Concurrent Deposits (20 ops) ---
Result: PASSED ✓
  Final Balance: 200 EUR (expected: 200 EUR)
  Successful Ops: 20/20
  Total Retries: ~100-150
  Duration: ~10-15s

--- Mixed Operations (30 ops) ---
Result: PASSED ✓
  Final Balance: 175 EUR (must be >= 0)
  Successful Ops: 30/30

--- Overdraft Prevention (10 ops) ---
Result: PASSED ✓
  Final Balance: 0 EUR (must be >= 0)
  Successful Ops: 10/10

========================================
  TEST SUMMARY
========================================
Total: 3 passed, 0 failed
```

## Project Structure

```
app/                    # Screens (file-based routing)
├── index.tsx           # Auth/Home screen
└── (banking)/          # Banking screens
    ├── index.tsx       # Dashboard
    ├── deposit.tsx     # Deposit screen
    ├── withdraw.tsx    # Withdraw screen
    └── history.tsx     # Transaction history

components/             # Reusable components
├── ui/                 # Base UI components
└── auth/               # Auth form components

contexts/               # React Context providers
├── auth-context.tsx    # Authentication state
└── banking-context.tsx # Banking state

lib/                    # Services and utilities
├── supabase.ts         # Supabase client
└── banking.ts          # Banking service (optimistic locking)

types/                  # TypeScript definitions
├── auth.ts
└── banking.ts

supabase/migrations/    # Database schema
scripts/                # Test scripts
```

## Documentation

See [TECHNICAL_REASONING.md](TECHNICAL_REASONING.md) for detailed technical documentation including:
- Optimistic locking implementation
- Retry logic with exponential backoff
- Security considerations (RLS)
- Architecture diagrams
