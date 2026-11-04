
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

export default function DatabaseTest() {
  const [status, setStatus] = useState("Checking connection...");

  useEffect(() => {
    async function testConnection() {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data, error } = await supabase
          .from("ipo_master")
          .select("*")
          .limit(1);

        if (error) {
          setStatus("Database Error: " + error.message);
        } else {
          setStatus("Supabase Connected Successfully!");
        }
      } catch (err) {
  setStatus(err instanceof Error ? err.message : String(err));
      }
      }
    }

    testConnection();
  }, []);

  return (
    <main style={{ padding: "30px", color: "white", background: "#102c2c", minHeight: "100vh" }}>
      <h1>Capital360IPO Database Test</h1>
      <p>{status}</p>
    </main>
  );
}
