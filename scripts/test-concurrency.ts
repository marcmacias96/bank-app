/**
 * Concurrency Test Script for Banking System
 * Peninsula Technical Test - Fullstack
 *
 * This script tests the concurrent balance update functionality
 * to ensure optimistic locking works correctly.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=eyJ... npx ts-node scripts/test-concurrency.ts
 *
 * Requires:
 *   - EXPO_PUBLIC_SUPABASE_URL (from .env.local)
 *   - SUPABASE_SERVICE_KEY (service role key for admin access)
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Load .env.local if available
import { config } from "dotenv";
config({ path: ".env.local" });

// Configuration
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL) {
  console.error("Error: Missing EXPO_PUBLIC_SUPABASE_URL");
  console.error("Make sure your .env.local file contains this variable.");
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.error("Error: Missing SUPABASE_SERVICE_KEY");
  console.error("\nThe service role key is required to create test accounts.");
  console.error("You can find it in your Supabase dashboard under Settings > API.");
  console.error("\nUsage:");
  console.error("  SUPABASE_SERVICE_KEY=eyJ... npx ts-node scripts/test-concurrency.ts");
  process.exit(1);
}

// Create admin client with service role key (bypasses RLS)
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface TestResult {
  testName: string;
  success: boolean;
  finalBalance: number;
  expectedBalance: number;
  totalOperations: number;
  successfulOperations: number;
  conflictRetries: number;
  duration: number;
  errors: string[];
}

/**
 * Helper: Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper: Generate a random UUID
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a test account with initial balance
 * Uses user_id = NULL for test accounts (bypasses auth.users FK)
 */
async function createTestAccount(initialBalance: number = 0): Promise<string> {
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: null, // NULL allowed for test accounts
      balance: initialBalance,
      currency: "EUR",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create test account: ${error.message}`);
  }

  return data.id;
}

/**
 * Delete a test account and its transactions
 */
async function deleteTestAccount(accountId: string): Promise<void> {
  // First delete transactions
  await supabase.from("transactions").delete().eq("account_id", accountId);
  // Then delete account
  await supabase.from("accounts").delete().eq("id", accountId);
}

/**
 * Execute a single balance update operation with retry logic
 */
async function executeBalanceUpdate(
  accountId: string,
  amount: number,
  type: "deposit" | "withdraw",
  maxRetries: number = 25
): Promise<{ success: boolean; retries: number; error?: string }> {
  let retries = 0;

  while (retries < maxRetries) {
    // Get current version
    const { data: account, error: fetchError } = await supabase
      .from("accounts")
      .select("version, balance")
      .eq("id", accountId)
      .single();

    if (fetchError) {
      return { success: false, retries, error: fetchError.message };
    }

    // Skip withdraw if insufficient funds
    if (type === "withdraw" && parseFloat(account.balance) < amount) {
      return { success: true, retries }; // Not an error, just skip
    }

    // Call the update_balance function
    const { data, error } = await supabase.rpc("update_balance", {
      p_account_id: accountId,
      p_amount: amount,
      p_type: type,
      p_expected_version: account.version,
      p_idempotency_key: generateUUID(),
    });

    if (error) {
      return { success: false, retries, error: error.message };
    }

    const result = data?.[0];

    if (result?.success) {
      return { success: true, retries };
    }

    if (result?.error_code === "VERSION_CONFLICT") {
      retries++;
      // Exponential backoff with jitter (capped at 500ms)
      const backoff = Math.min(50 * Math.pow(1.5, retries), 500);
      await sleep(backoff + Math.random() * 50);
      continue;
    }

    if (result?.error_code === "INSUFFICIENT_FUNDS") {
      return { success: true, retries }; // Expected behavior
    }

    return { success: false, retries, error: result?.error_message };
  }

  return { success: false, retries, error: "Max retries exceeded" };
}

/**
 * TEST 1: Concurrent Deposits
 *
 * Creates N concurrent deposit operations of 10 EUR each.
 * Expected: Final balance = Initial balance + (N * 10)
 */
async function testConcurrentDeposits(
  concurrentOperations: number = 50
): Promise<TestResult> {
  const testName = `Concurrent Deposits (${concurrentOperations} ops)`;
  const startTime = Date.now();
  const errors: string[] = [];

  console.log(`\n--- ${testName} ---`);
  console.log(
    `Starting ${concurrentOperations} concurrent deposits of 10 EUR each...`
  );

  // Create test account with 0 balance
  const accountId = await createTestAccount(0);

  const depositAmount = 10;
  const expectedFinal = concurrentOperations * depositAmount;

  let successCount = 0;
  let totalRetries = 0;

  // Execute all deposits concurrently
  const operations = Array.from({ length: concurrentOperations }, () =>
    executeBalanceUpdate(accountId, depositAmount, "deposit")
  );

  const results = await Promise.all(operations);

  results.forEach((result, i) => {
    if (result.success) {
      successCount++;
    } else if (result.error) {
      errors.push(`Op ${i}: ${result.error}`);
    }
    totalRetries += result.retries;
  });

  // Get final balance
  const { data: finalAccount } = await supabase
    .from("accounts")
    .select("balance")
    .eq("id", accountId)
    .single();

  const finalBalance = parseFloat(finalAccount?.balance ?? "0");
  const duration = Date.now() - startTime;

  // Cleanup
  await deleteTestAccount(accountId);

  const success =
    finalBalance === expectedFinal && successCount === concurrentOperations;

  console.log(`Result: ${success ? "PASSED ✓" : "FAILED ✗"}`);
  console.log(
    `  Final Balance: ${finalBalance} EUR (expected: ${expectedFinal} EUR)`
  );
  console.log(`  Successful Ops: ${successCount}/${concurrentOperations}`);
  console.log(`  Total Retries: ${totalRetries}`);
  console.log(`  Duration: ${duration}ms`);

  return {
    testName,
    success,
    finalBalance,
    expectedBalance: expectedFinal,
    totalOperations: concurrentOperations,
    successfulOperations: successCount,
    conflictRetries: totalRetries,
    duration,
    errors,
  };
}

/**
 * TEST 2: Mixed Deposits and Withdrawals
 *
 * Creates concurrent deposits and withdrawals to test race conditions.
 * Expected: Final balance >= 0 (never negative)
 */
async function testMixedOperations(iterations: number = 30): Promise<TestResult> {
  const testName = `Mixed Operations (${iterations * 2} ops)`;
  const startTime = Date.now();
  const errors: string[] = [];

  console.log(`\n--- ${testName} ---`);
  console.log(`Starting ${iterations} deposits and ${iterations} withdrawals...`);

  // Create test account with 100 EUR
  const accountId = await createTestAccount(100);

  let successCount = 0;
  let totalRetries = 0;

  // Create mixed operations
  const operations: Promise<{
    success: boolean;
    retries: number;
    error?: string;
  }>[] = [];

  for (let i = 0; i < iterations; i++) {
    // Deposit 10 EUR
    operations.push(executeBalanceUpdate(accountId, 10, "deposit"));
    // Withdraw 5 EUR
    operations.push(executeBalanceUpdate(accountId, 5, "withdraw"));
  }

  // Execute all operations concurrently
  const results = await Promise.all(operations);

  results.forEach((result, i) => {
    if (result.success) {
      successCount++;
    } else if (result.error) {
      errors.push(`Op ${i}: ${result.error}`);
    }
    totalRetries += result.retries;
  });

  // Get final balance
  const { data: finalAccount } = await supabase
    .from("accounts")
    .select("balance")
    .eq("id", accountId)
    .single();

  const finalBalance = parseFloat(finalAccount?.balance ?? "0");
  const duration = Date.now() - startTime;

  // Cleanup
  await deleteTestAccount(accountId);

  // Success criteria: balance is non-negative
  const success = finalBalance >= 0;

  console.log(`Result: ${success ? "PASSED ✓" : "FAILED ✗"}`);
  console.log(`  Final Balance: ${finalBalance} EUR (must be >= 0)`);
  console.log(`  Successful Ops: ${successCount}/${iterations * 2}`);
  console.log(`  Total Retries: ${totalRetries}`);
  console.log(`  Duration: ${duration}ms`);

  return {
    testName,
    success,
    finalBalance,
    expectedBalance: -1, // Variable, just needs to be >= 0
    totalOperations: iterations * 2,
    successfulOperations: successCount,
    conflictRetries: totalRetries,
    duration,
    errors,
  };
}

/**
 * TEST 3: Overdraft Prevention
 *
 * Attempts to withdraw more than the balance multiple times concurrently.
 * Expected: Balance never goes negative
 */
async function testOverdraftPrevention(
  concurrentWithdrawals: number = 20
): Promise<TestResult> {
  const testName = `Overdraft Prevention (${concurrentWithdrawals} ops)`;
  const startTime = Date.now();
  const errors: string[] = [];

  console.log(`\n--- ${testName} ---`);
  console.log(
    `Starting ${concurrentWithdrawals} concurrent withdrawals of 10 EUR from 50 EUR balance...`
  );

  // Create test account with 50 EUR
  const accountId = await createTestAccount(50);

  let successCount = 0;
  let totalRetries = 0;

  // All try to withdraw 10 EUR (only 5 should succeed)
  const operations = Array.from({ length: concurrentWithdrawals }, () =>
    executeBalanceUpdate(accountId, 10, "withdraw")
  );

  const results = await Promise.all(operations);

  results.forEach((result, i) => {
    if (result.success) {
      successCount++;
    } else if (result.error) {
      errors.push(`Op ${i}: ${result.error}`);
    }
    totalRetries += result.retries;
  });

  // Get final balance
  const { data: finalAccount } = await supabase
    .from("accounts")
    .select("balance")
    .eq("id", accountId)
    .single();

  const finalBalance = parseFloat(finalAccount?.balance ?? "0");
  const duration = Date.now() - startTime;

  // Cleanup
  await deleteTestAccount(accountId);

  // Success criteria: balance is exactly 0 or positive (never negative)
  const success = finalBalance >= 0;

  console.log(`Result: ${success ? "PASSED ✓" : "FAILED ✗"}`);
  console.log(`  Final Balance: ${finalBalance} EUR (must be >= 0)`);
  console.log(`  Successful Ops: ${successCount}/${concurrentWithdrawals}`);
  console.log(`  Total Retries: ${totalRetries}`);
  console.log(`  Duration: ${duration}ms`);

  return {
    testName,
    success,
    finalBalance,
    expectedBalance: 0,
    totalOperations: concurrentWithdrawals,
    successfulOperations: successCount,
    conflictRetries: totalRetries,
    duration,
    errors,
  };
}

/**
 * Main test runner
 */
async function runAllTests(): Promise<void> {
  console.log("========================================");
  console.log("  CONCURRENCY TESTS - Banking System");
  console.log("  Peninsula Technical Test");
  console.log("========================================");
  console.log(`\nSupabase URL: ${SUPABASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const results: TestResult[] = [];

  try {
    // Test 1: Concurrent Deposits (20 concurrent ops is realistic)
    results.push(await testConcurrentDeposits(20));

    // Test 2: Mixed Operations
    results.push(await testMixedOperations(15));

    // Test 3: Overdraft Prevention
    results.push(await testOverdraftPrevention(10));

    // Summary
    console.log("\n========================================");
    console.log("  TEST SUMMARY");
    console.log("========================================\n");

    const passed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    results.forEach((r) => {
      console.log(`${r.success ? "[PASS]" : "[FAIL]"} ${r.testName}`);
      console.log(
        `       Balance: ${r.finalBalance} | Ops: ${r.successfulOperations}/${r.totalOperations} | Retries: ${r.conflictRetries} | Time: ${r.duration}ms`
      );
    });

    console.log("\n----------------------------------------");
    console.log(`Total: ${passed} passed, ${failed} failed`);
    console.log("----------------------------------------\n");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("\nFATAL ERROR:", error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
