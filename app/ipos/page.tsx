
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type IPO = {
  uuid: string;
  company_name: string;
  price_band: string;
  open_date: string;
  close_date: string;
  listing_date: string;
  status: string;
};

export default function IPOPage() {
  const [ipos, setIpos] = useState<IPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadIPOs() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !key) {
          throw new Error("Supabase settings missing");
        }

        const supabase = createClient(url, key);

        const { data, error } = await supabase
          .from("ipo_master")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;

        setIpos((data || []) as IPO[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    loadIPOs();
  }, []);

  return (
    <main style={{
      minHeight: "100vh",
      background: "#071c20",
      color: "white",
      padding: "30px 20px"
    }}>
      <a href="/" style={{ color: "#43d6b0" }}>← Home</a>

      <h1 style={{ fontSize: "32px", marginTop: "25px" }}>
        IPO <span style={{ color: "#43d6b0" }}>Updates</span>
      </h1>

      <p style={{ color: "#a8c0c0" }}>
        Latest IPO information by Capital360IPO
      </p>

      {loading && <p>Loading IPOs...</p>}

      {error && <p style={{ color: "#ff7777" }}>Error: {error}</p>}

      {!loading && !error && ipos.length === 0 && (
        <p>No IPOs available yet.</p>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: "18px",
        marginTop: "25px"
      }}>
        {ipos.map((ipo) => (
          <article key={ipo.uuid} style={{
            background: "#123238",
            border: "1px solid #285057",
            borderRadius: "14px",
            padding: "22px"
          }}>
            <h2 style={{ fontSize: "22px" }}>{ipo.company_name}</h2>

            <p>Price Band: {ipo.price_band}</p>
            <p>Open Date: {ipo.open_date}</p>
            <p>Close Date: {ipo.close_date}</p>
            <p>Listing Date: {ipo.listing_date}</p>

            <p style={{
              color: "#43d6b0",
              fontWeight: "bold"
            }}>
              Status: {ipo.status}
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
