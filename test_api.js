require('dotenv').config({ path: './apps/mobile/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
async function test() {
  const { data, error } = await supabase.from('customers').select('*');
  console.log('Error:', error);
  console.log('Customers count:', data ? data.length : 0);
}
test();
