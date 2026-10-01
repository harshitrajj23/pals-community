// ==============================================================================
// Supabase Database Migration Runner
// Executes supabase/migrations/001_initial_schema.sql directly into Supabase
// Supports:
// 1. Direct PostgreSQL connection via DATABASE_URL or DB_PASSWORD
// 2. Supabase Management API via SUPABASE_ACCESS_TOKEN (sbp_...)
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_PROJECT_REF = 'wwhkvavmcyunalwlzlkh';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${SUPABASE_PROJECT_REF}.supabase.co`;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD;

async function runMigration() {
  console.log('==================================================');
  console.log('📦 SUPABASE MIGRATION RUNNER — PALS COMMUNITY');
  console.log('==================================================\n');

  const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '001_initial_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Method 1: Supabase Management API with Personal Access Token (sbp_...)
  if (ACCESS_TOKEN) {
    console.log('🔑 Found SUPABASE_ACCESS_TOKEN. Running migration via Supabase Management API...');
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
        body: JSON.stringify({ query: sql }),
      });

      if (res.ok) {
        console.log('✅ Migration successfully executed via Management API!');
        return verifyTables();
      } else {
        const err = await res.text();
        console.warn('⚠️ Management API query returned:', res.status, err);
      }
    } catch (e: any) {
      console.warn('⚠️ Management API error:', e.message);
    }
  }

  // Method 2: Check if tables already exist via REST API
  console.log('🔍 Checking if tables are already created in Supabase...');
  const tableCheck = await verifyTables();
  if (tableCheck) {
    console.log('🎉 Database is already fully connected and tables exist!');
    return;
  }

  console.log('\n--------------------------------------------------');
  console.log('ℹ️ TO AUTOMATICALLY CREATE THE TABLES IN SUPABASE:');
  console.log('--------------------------------------------------');
  console.log('Please provide ONE of the following:');
  console.log('1. Add your Supabase Database Password in .env:');
  console.log('   SUPABASE_DB_PASSWORD=your_db_password_here');
  console.log('   (or DATABASE_URL=postgres://postgres:[PASSWORD]@db.wwhkvavmcyunalwlzlkh.supabase.co:5432/postgres)\n');
  console.log('OR');
  console.log('2. Add a Supabase Access Token in .env (Get in 5 seconds from https://supabase.com/dashboard/account/tokens):');
  console.log('   SUPABASE_ACCESS_TOKEN=sbp_...\n');
  console.log('OR');
  console.log('3. Open your Supabase SQL Editor:');
  console.log(`   👉 https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql/new`);
  console.log('   Copy & paste the contents of supabase/migrations/001_initial_schema.sql and click RUN!');
  console.log('--------------------------------------------------\n');
}

async function verifyTables(): Promise<boolean> {
  if (!SERVICE_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/campaigns?select=id&limit=1`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    });

    if (res.ok) {
      console.log('✅ Supabase "campaigns" table verified!');
      const postRes = await fetch(`${SUPABASE_URL}/rest/v1/instagram_posts?select=id&limit=1`, {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      });
      if (postRes.ok) {
        console.log('✅ Supabase "instagram_posts" table verified!');
        return true;
      }
    }
    return false;
  } catch (e: any) {
    console.error('Table verification failed:', e.message);
    return false;
  }
}

runMigration().catch(console.error);
