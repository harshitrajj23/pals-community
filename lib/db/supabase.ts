// ==============================================================================
// Supabase Client Factory
// Dynamically initializes @supabase/supabase-js with graceful fallback
// ==============================================================================

let supabaseInstance: any = null;

export async function getSupabaseClient(): Promise<any | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  if (!supabaseInstance) {
    try {
      // Dynamic import allows running without crash if package is installing or unconfigured
      const { createClient } = await import('@supabase/supabase-js');
      supabaseInstance = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    } catch {
      console.warn('[Supabase] @supabase/supabase-js not loaded yet. Falling back to local repository.');
      return null;
    }
  }

  return supabaseInstance;
}
