"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

export default function DatabaseTest() {
  const [status, setStatus] = useState("Checking connection...");

  useEffect(() => {
    const testConnection = async () => {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !key) {
          setStatus("Supabase Environment Variables Missing");
          return;
        }

        const supabase = createClient(url, key);

        const { error } = await supabase
          .from("ipo_master")
          .select("*")
          .limit(1);

        if (error) {
          setStatus("Database Error: " + error.message);
        } else {
          setStatus("Supabase Connected Successfully!");
        }
      } catch (err) {
        setStatus(
          err instanceof Error ? err.message : String(err)
        );
      }
    };

    void testConnection();
  }, []);

  return (
    <main
      style={{
        padding: "30px",
        color: "white",
        background: "#102c2c",
        minHeight: "100vh",
      }}
    >
      <h1>Capital360IPO Database Test</h1>
      <p>{status}</p>
    </main>
  );
}
