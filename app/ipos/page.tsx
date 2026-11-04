
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type IPO = {
  uuid: string;
  company_name: string;
  price_band: string;
  open_date: string;
  close_date: string;
  listing_date: string;
  status: string;
  created_at?: string;
};

const formatDate = (date: string) => {
  if (!date) return "To be announced";
  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const statusColor = (status: string) => {
  const s = status.toLowerCase();
  if (s === "open") return "#20e69a";
  if (s === "listed") return "#60a5fa";
  if (s === "closed") return "#fbbf24";
  return "#fbbf24";
};

export default function IPOPage() {
  const [ipos, setIpos] = useState<IPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadIPOs() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !key) throw new Error("Database settings missing");

        const supabase = createClient(url, key);
        const { data, error } = await supabase
          .from("ipo_master")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setIpos((data || []) as IPO[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load IPOs");
      } finally {
        setLoading(false);
      }
    }

    loadIPOs();
  }, []);

  const filtered = useMemo(
    () =>
      ipos.filter((ipo) =>
        ipo.company_name.toLowerCase().includes(search.toLowerCase())
      ),
    [ipos, search]
  );

  const latest = filtered[0];
  const upcoming = filtered.filter((ipo) =>
    ["upcoming", "open"].includes(ipo.status.toLowerCase())
  );
  const past = filtered.filter((ipo) =>
    ["closed", "listed"].includes(ipo.status.toLowerCase())
  );

  const cardStyle = {
    background: "linear-gradient(145deg,#102b3d,#0b1c2b)",
    border: "1px solid #24465a",
    borderRadius: "18px",
    padding: "22px",
  };

  const renderCard = (ipo: IPO) => (
    <article key={ipo.uuid} style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <h3 style={{ fontSize: 20, margin: 0 }}>{ipo.company_name}</h3>
        <span style={{
          color: "#071c20",
          background: statusColor(ipo.status),
          padding: "6px 11px",
          borderRadius: 30,
          fontSize: 12,
          fontWeight: 800,
          whiteSpace: "nowrap",
        }}>
          {ipo.status}
        </span>
      </div>
      <p style={{ color: "#9eb5c5", marginTop: 18 }}>
        Price Band
      </p>
      <strong style={{ fontSize: 21, color: "#39e5aa" }}>
        {ipo.price_band || "Not announced"}
      </strong>
      <div style={{
        borderTop: "1px solid #294354",
        marginTop: 18,
        paddingTop: 14,
        display: "grid",
        gap: 12,
      }}>
        <p style={{ margin: 0 }}>📅 Open: {formatDate(ipo.open_date)}</p>
        <p style={{ margin: 0 }}>📅 Close: {formatDate(ipo.close_date)}</p>
        <p style={{ margin: 0 }}>📈 Listing: {formatDate(ipo.listing_date)}</p>
      </div>
    </article>
  );

  return (
    <main style={{
      minHeight: "100vh",
      background: "#061421",
      color: "#f5f9ff",
      fontFamily: "Arial, sans-serif",
    }}>
      <style>{`
        * { box-sizing: border-box; }
        a { text-decoration: none; }
        .nav { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
        .navlinks { display:flex; gap:22px; flex-wrap:wrap; }
        .navlinks a { color:#c6d6e4; font-weight:600; }
        .navlinks a:hover { color:#39e5aa; }
        .hero { display:grid; grid-template-columns:1.2fr .8fr; align-items:center; gap:20px; }
        .hero h1 { font-size:clamp(42px,7vw,76px); line-height:1.05; margin:14px 0; }
        .green { color:#39e5aa; }
        .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:18px; }
        .search { width:100%; max-width:350px; padding:13px 16px; border-radius:30px; border:1px solid #315064; background:#10283a; color:white; outline:none; }
        .latest { display:grid; grid-template-columns:220px 1fr; gap:26px; align-items:center; }
        @media(max-width:650px) {
          .hero { grid-template-columns:1fr; }
          .latest { grid-template-columns:1fr; }
          .nav { align-items:flex-start; }
          .navlinks { gap:14px; }
        }
      `}</style>

      <header style={{
        padding: "20px 5%",
        borderBottom: "1px solid #20394c",
        background: "#081a2a",
      }}>
        <div className="nav">
          <a href="/" style={{ color: "white", fontSize: 25, fontWeight: 900 }}>
            CAPITAL<span className="green">360</span>IPO
          </a>
          <nav className="navlinks">
            <a href="/ipos" className="green">IPOs</a>
            <a href="/news">News</a>
            <a href="/stocks">Stocks</a>
            <a href="/about">About</a>
          </nav>
        </div>
      </header>

      <div style={{ padding: "45px 5% 60px" }}>
        <section className="hero">
          <div>
            <p className="green" style={{ fontWeight: 800, letterSpacing: 3 }}>
              YOUR MARKET. YOUR KNOWLEDGE.
            </p>
            <h1>IPO <span className="green">Updates</span></h1>
            <p style={{ color: "#c2d0dd", fontSize: 18, lineHeight: 1.7 }}>
              Stay ahead with IPO details, price bands, important dates
              and market insights — only on Capital360IPO.
            </p>
            <p className="green">⚡ Detailed Information　　📊 Market Updates</p>
          </div>
          <div style={{
            textAlign: "center",
            fontSize: 100,
            padding: 30,
            borderRadius: 25,
            background: "radial-gradient(circle,#174c50,#0b2031 70%)",
          }}>
            🐂
            <p style={{ fontSize: 15, color: "#39e5aa", fontWeight: 800 }}>
              CAPITAL360IPO
            </p>
          </div>
        </section>

        <section style={{
          marginTop: 35,
          padding: 25,
          borderRadius: 20,
          border: "1px solid #168c7c",
          background: "linear-gradient(120deg,#103a42,#0b2036)",
        }}>
          <p className="green" style={{ fontWeight: 800 }}>★ LATEST IPO</p>
          {loading ? (
            <p>Loading IPO information...</p>
          ) : error ? (
            <p style={{ color: "#ff8888" }}>Database Error: {error}</p>
          ) : latest ? (
            <div className="latest">
              <div style={{
                padding: 25,
                borderRadius: 15,
                background: "#f3f8fb",
                color: "#0b2638",
                textAlign: "center",
                fontSize: 25,
                fontWeight: 900,
              }}>
                CAPITAL<span style={{ color: "#16a879" }}>360</span>IPO
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <h2 style={{ fontSize: 28, margin: 0 }}>{latest.company_name}</h2>
                  <span style={{ color: statusColor(latest.status), fontWeight: 800 }}>
                    ● {latest.status}
                  </span>
                </div>
                <p style={{ color: "#c3d5df" }}>IPO Information & Important Dates</p>
                <div className="grid" style={{ marginTop: 22 }}>
                  <div>₹ Price Band<br /><strong>{latest.price_band || "Not announced"}</strong></div>
                  <div>📅 Open Date<br /><strong>{formatDate(latest.open_date)}</strong></div>
                  <div>📅 Close Date<br /><strong>{formatDate(latest.close_date)}</strong></div>
                  <div>📈 Listing Date<br /><strong>{formatDate(latest.listing_date)}</strong></div>
                </div>
              </div>
            </div>
          ) : (
            <p>No IPO information available yet.</p>
          )}
        </section>

        <section style={{ marginTop: 45 }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 15,
          }}>
            <h2>🗓️ Upcoming <span className="green">IPOs</span></h2>
            <input
              className="search"
              placeholder="Search IPO..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? <p>Loading...</p> : (
            <div className="grid">
              {upcoming.length ? upcoming.map(renderCard) : (
                <p style={{ color: "#a9bdca" }}>No upcoming IPOs found.</p>
              )}
            </div>
          )}
        </section>

        <section style={{ marginTop: 45 }}>
          <h2>✓ Past <span className="green">IPOs</span></h2>
          <div className="grid">
            {past.length ? past.map(renderCard) : (
              <p style={{ color: "#a9bdca" }}>No past IPOs available yet.</p>
            )}
          </div>
        </section>

        <footer style={{
          marginTop: 55,
          padding: 22,
          borderTop: "1px solid #294354",
          textAlign: "center",
          color: "#8da6b7",
        }}>
          © {new Date().getFullYear()} Capital360IPO.
          <br />
          Informational content only. Not investment advice.
        </footer>
      </div>
    </main>
  );
}
