# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm start              # Start Expo development server
npm run ios            # Start on iOS simulator
npm run android        # Start on Android emulator
npm run web            # Start web version
npm run lint           # Run ESLint

# Concurrency tests (requires SUPABASE_SERVICE_KEY in .env.local)
npx tsx scripts/test-concurrency.ts
```

## Architecture

React Native banking app (Expo) implementing **optimistic concurrency control** for balance management. Uses Supabase (PostgreSQL + Auth) with NativeWind styling.

### Core Concept: Optimistic Locking

Balance updates use version-based conflict detection:
1. Client reads current `version` from account
2. Client calls `update_balance` RPC with `expected_version`
3. Server atomically updates only if version matches
4. On `VERSION_CONFLICT`, client retries with exponential backoff

### Project Structure

```
app/                    # File-based routing (expo-router)
├── _layout.tsx         # Root layout (AuthProvider)
├── index.tsx           # Auth/Home screen
└── (banking)/          # Banking route group
    ├── _layout.tsx     # BankingProvider wrapper
    └── *.tsx           # Dashboard, deposit, withdraw, history

contexts/
├── auth-context.tsx    # useAuth() - user, session, signIn/signUp/signOut
└── banking-context.tsx # useBanking() - account, transactions, updateBalance

lib/
├── supabase.ts         # Supabase client
└── banking.ts          # updateBalance with retry logic, getAccount, getTransactions

types/
├── auth.ts             # Auth types
└── banking.ts          # Account, Transaction, BankingError, RetryConfig

supabase/migrations/
└── 001_banking.sql     # Schema, RLS policies, update_balance function
```

### Key Patterns

**Banking Service** (`lib/banking.ts`):
- `updateBalance(params, retryConfig)` - Main function with retry logic
- `getOrCreateDemoAccount()` - For demo mode (user_id = NULL)
- Uses `BankingError` class with typed error codes

**Banking Context** (`contexts/banking-context.tsx`):
- Wraps service layer for React components
- Auto-loads account based on auth state (user account or demo)
- `useBanking()` provides: `account`, `transactions`, `updateBalance`, `refreshAccount`

**Database** (`supabase/migrations/001_banking.sql`):
- `accounts` table with `version` column and `CHECK (balance >= 0)`
- `transactions` table for audit trail with `idempotency_key`
- `update_balance` RPC function with atomic version check
- RLS policies for user accounts + demo accounts (user_id IS NULL)

### Environment Variables

Copy `.env.example` to `.env.local`:
```
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_KEY=your-service-key  # Only for tests
```

### Path Aliases

Use `@/*` for imports from project root:
```typescript
import { useAuth } from '@/contexts/auth-context';
import { useBanking } from '@/contexts/banking-context';
import { updateBalance } from '@/lib/banking';
```

### Styling with NativeWind

Tailwind CSS classes via NativeWind v4:
```tsx
<View className="flex-1 items-center justify-center bg-white">
  <Text className="text-2xl font-bold text-gray-900">Hello</Text>
</View>
```

UI components in `components/ui/` use `class-variance-authority` for variants.
