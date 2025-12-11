# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm start          # Start Expo development server
npm run ios        # Start on iOS simulator
npm run android    # Start on Android emulator
npm run web        # Start web version
npm run lint       # Run ESLint
```

## Architecture

Expo React Native app with file-based routing (expo-router), NativeWind (Tailwind CSS), and Supabase.

### Project Structure
```
app/              # File-based routing screens
components/       # Reusable UI components
contexts/         # React Context providers
lib/              # External service clients (Supabase)
types/            # TypeScript type definitions
```

### Styling with NativeWind
Uses Tailwind CSS classes via NativeWind v4:
```tsx
<View className="flex-1 items-center justify-center bg-white">
  <Text className="text-2xl font-bold text-gray-900">Hello</Text>
</View>
```

Configuration files: `tailwind.config.js`, `metro.config.js`, `babel.config.js`, `global.css`

### Authentication (Supabase Auth)
- `lib/supabase.ts` - Supabase client configuration
- `contexts/auth-context.tsx` - Auth state management via React Context
- `useAuth()` hook provides: `user`, `session`, `isLoading`, `isAuthenticated`, `signIn`, `signUp`, `signOut`, `signInWithOAuth`

### Environment Variables
Copy `.env.example` to `.env.local` and configure:
```
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Path Aliases
Use `@/*` to import from project root:
```typescript
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth-context';
```
