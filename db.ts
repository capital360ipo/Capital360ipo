import {createClient} from "@supabase/supabase-js";
export function db(){const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;return u&&k?createClient(u,k,{auth:{persistSession:false}}):null;}
