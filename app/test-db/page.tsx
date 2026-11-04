"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TestDB() {
  const [status, setStatus] = useState("Checking connection...");

  useEffect(() => {
    async function checkConnection() {
      try {
        const { error } = await supabase.auth.getSession();

        if (error) {
          setStatus("Connection check failed");
        } else {
          setStatus("Supabase client initialized successfully");
        }
      } catch {
        setStatus("Connection check failed");
      }
    }

    checkConnection();
  }, []);

  return (
    <main style={{ padding: "40px" }}>
      <h1>Supabase Connection Test</h1>
      <p>{status}</p>
    </main>
  );
}
