
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type IPO = {
  uuid: string;
  company_name: string;
  price_band?: string | null;
  open_date?: string | null;
  close_date?: string | null;
  closing_date?: string | null;
  listing_date?: string | null;
  status?: string | null;
  created_at?: string | null;
};

function formatDate(date?: string | null) {
  if (!date) return "Not announced";

  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function IPOPage() {
  const params = useParams();
  const id = params.id as string;

  const [ipo, setIpo] = useState<IPO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchIPO() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !key) {
          throw new Error("Supabase Environment Variables missing. Check Vercel settings.");
        }

        if (!id) {
          throw new Error("IPO ID is missing from the URL.");
        }

        const supabase = createClient(url, key);

        const { data, error: fetchError } = await supabase
          .from("ipo_master")
          .select("*")
          .eq("uuid", id)
          .maybeSingle();

        if (fetchError) {
          throw new Error(
            `Supabase Error: ${fetchError.message} (Code: ${fetchError.code || "N/A"})`
          );
        }

        if (!data) {
          throw new Error(
            `IPO record not found for ID: ${id}. Check whether this UUID exists in ipo_master and is readable under RLS.`
          );
        }

        setIpo(data as IPO);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unknown error occurred."
        );
      } finally {
        setLoading(false);
      }
    }

    fetchIPO();
  }, [id]);

  if (loading) {
    return (
      <main style={{
        minHeight: "100vh",
        background: "#061421",
        color: "white",
        display: "grid",
        placeItems: "center",
        fontFamily: "Arial",
      }}>
        <h2>Loading IPO Details...</h2>
      </main>
    );
  }

  if (error || !ipo) {
    return (
      <main style={{
        minHeight: "100vh",
        background: "#061421",
        color: "white",
        display: "grid",
        placeItems: "center",
        padding: 20,
        fontFamily: "Arial",
      }}>
        <div style={{
          maxWidth: 650,
          width: "100%",
          padding: 28,
          borderRadius: 18,
          background: "#10283a",
          border: "1px solid #315064",
        }}>
          <h1 style={{ color: "#ff7777", fontSize: 28 }}>
            IPO Details Not Available
          </h1>
          <p style={{ color: "#d1dce5", lineHeight: 1.7, overflowWrap: "anywhere" }}>
            {error || "IPO record not found."}
          </p>
          <a href="/ipos" style={{
            display: "inline-block",
            marginTop: 18,
            padding: "12px 20px",
            borderRadius: 10,
            background: "#39e5aa",
            color: "#06221d",
            fontWeight: 800,
            textDecoration: "none",
          }}>
            ← Back to IPO List
          </a>
        </div>
      </main>
    );
  }

  const closingDate = ipo.close_date || ipo.closing_date;

  return (
    <main style={{
      minHeight: "100vh",
      background: "#061421",
      color: "#f5f9ff",
      fontFamily: "Arial, sans-serif",
    }}>
      <style>{`
        * { box-sizing: border-box; }
        .ipo-container { max-width: 1100px; margin: auto; padding: 35px 20px 60px; }
        .ipo-panel { background: linear-gradient(145deg,#102b3d,#0b1c2b); border: 1px solid #24465a; border-radius: 18px; padding: 24px; }
        .ipo-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(200px,1fr)); gap: 15px; margin-top: 25px; }
        .ipo-stat { padding: 18px; border-radius: 13px; background: #ffffff0b; border: 1px solid #ffffff16; }
        .ipo-label { color: #9eb5c5; font-size: 14px; }
        .ipo-value { margin-top: 9px; font-size: 19px; font-weight: 800; color: #39e5aa; }
        .ipo-section { margin-top: 22px; }
        .ipo-back { color: #39e5aa; text-decoration: none; }
      `}</style>

      <div className="ipo-container">
        <a href="/ipos" className="ipo-back">← Back to All IPOs</a>

        <section className="ipo-panel" style={{ marginTop: 25 }}>
          <span style={{
            display: "inline-block",
            background: "#39e5aa20",
            color: "#39e5aa",
            padding: "7px 14px",
            borderRadius: 30,
            fontWeight: 800,
            fontSize: 13,
          }}>
            {ipo.status || "IPO"}
          </span>

          <h1 style={{
            fontSize: "clamp(30px,6vw,48px)",
            margin: "20px 0 10px",
          }}>
            {ipo.company_name}
          </h1>

          <p style={{ color: "#9eb5c5" }}>
            Complete IPO information by Capital360IPO
          </p>

          <div className="ipo-grid">
            <div className="ipo-stat">
              <div className="ipo-label">Price Band</div>
              <div className="ipo-value">{ipo.price_band || "Not announced"}</div>
            </div>

            <div className="ipo-stat">
              <div className="ipo-label">Opening Date</div>
              <div className="ipo-value">{formatDate(ipo.open_date)}</div>
            </div>

            <div className="ipo-stat">
              <div className="ipo-label">Closing Date</div>
              <div className="ipo-value">{formatDate(closingDate)}</div>
            </div>

            <div className="ipo-stat">
              <div className="ipo-label">Listing Date</div>
              <div className="ipo-value">{formatDate(ipo.listing_date)}</div>
            </div>
          </div>
        </section>

        <section className="ipo-panel ipo-section">
          <h2 style={{ fontSize: 23 }}>IPO Overview</h2>
          <p style={{ color: "#b7c9d7", lineHeight: 1.8 }}>
            {ipo.company_name} IPO details and important dates are shown above.
            Additional verified information will be displayed as it is added
            to the Capital360IPO database.
          </p>
        </section>

        <section className="ipo-panel ipo-section">
          <h2 style={{ fontSize: 23 }}>More IPO Information</h2>
          <div className="ipo-grid">
            {[
              "GMP History",
              "Subscription Details",
              "Company Profile",
              "Financial Performance",
              "Promoters & Risks",
              "Allotment & Listing",
              "Official Documents",
              "Frequently Asked Questions",
            ].map((item) => (
              <div className="ipo-stat" key={item}>
                <strong>{item}</strong>
                <p style={{ color: "#9eb5c5", fontSize: 13 }}>
                  Verified information will be added here.
                </p>
              </div>
            ))}
          </div>
          <p style={{
            color: "#e9c46a",
            fontSize: 13,
            marginTop: 22,
            lineHeight: 1.7,
          }}>
            Note: GMP is unofficial and speculative. Always verify IPO
            information with official exchange and issuer documents.
          </p>
        </section>

        <footer style={{
          textAlign: "center",
          color: "#8299aa",
          padding: "30px 0",
          fontSize: 13,
        }}>
          © {new Date().getFullYear()} Capital360IPO. Informational purposes only.
        </footer>
      </div>
    </main>
  );
}
