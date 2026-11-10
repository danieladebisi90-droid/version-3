const SUPABASE_URL = "https://kcaadqbczgjtvnyztrvb.supabase.co";
const SUPABASE_KEY = "sb_publishable_LRmqZYtPzoUJJNvz4Scx9g_PPBpOWwX";

// Initialize Supabase and make it available to other scripts
window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);
