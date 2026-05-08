// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://tatzpaxvkrirraxjyrhh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhdHpwYXh2a3JpcnJheGp5cmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2MTI0OTcsImV4cCI6MjA3MDE4ODQ5N30.q3epFJ2XdGo-CuxutaKTUmS1RnFUpPpxqm-QdyIXx6g";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
