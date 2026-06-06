const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    env[key] = value.trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkData() {
  const dummyCust = {
    id: "cust-123",
    company_id: "c0a80101-0000-0000-0000-000000000000", // valid uuid format
    name: "Cliente Teste",
    document: "12345678909"
  };

  const { data: insertData, error: insertError } = await supabase
    .from('customers')
    .insert([dummyCust])
    .select();

  if (insertError) {
    console.error("Customers Insert Error:", insertError);
  } else {
    console.log("Customers Insert Success:", JSON.stringify(insertData, null, 2));
  }
}

checkData();
