const features = [
  {
    number: "01",
    title: "IPO Research",
    description:
      "Explore upcoming, open and recently listed IPOs with detailed company information.",
    href: "/ipos",
    tag: "PRIMARY",
  },
  {
    number: "02",
    title: "Market Intelligence",
    description:
      "Follow important business updates, financial developments and market news.",
    href: "/news",
    tag: "NEWS & UPDATES",
  },
  {
    number: "03",
    title: "Stock Insights",
    description:
      "Discover companies, understand market movements and explore stock research.",
    href: "/stocks",
    tag: "RESEARCH",
  },
];

const platformAreas = [
  ["IPO MARKET", "IPO calendar, issue details and listing performance."],
  ["EQUITY MARKETS", "Market indices, stocks and company insights."],
  ["INVESTOR TOOLS", "Future portfolio, watchlist and investment tools."],
  ["MARKET LEARNING", "Understand financial markets with useful resources."],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#080e1b] text-white">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#080e1b]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-8">
          <a href="/" className="text-2xl font-black tracking-tight">
            CAPITAL<span className="text-emerald-400">360</span>IPO
          </a>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium text-slate-300">
            <a href="/" className="text-emerald-400">Home</a>
            <a href="/ipos" className="hover:text-emerald-400">IPOs</a>
            <a href="/news" className="hover:text-emerald-400">News</a>
            <a href="/stocks" className="hover:text-emerald-400">Stocks</a>
            <a href="/about" className="hover:text-emerald-400">About</a>
          </nav>

          <a
            href="/ipos"
            className="rounded-lg bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"
          >
            Explore IPOs ↗
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-emerald-400/10 blur-[130px]" />
        <div className="pointer-events-none absolute -left-40 bottom-0 h-80 w-80 rounded-full bg-blue-500/10 blur-[120px]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-32">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-4 py-2 text-xs font-bold tracking-[0.18em] text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              YOUR MARKET. YOUR KNOWLEDGE.
            </div>

            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.12] tracking-tight sm:text-6xl lg:text-7xl">
              Make smarter
              <br />
              decisions in
              <br />
              <span className="text-emerald-400">financial markets.</span>
            </h1>

            <p className="mt-8 max-w-xl text-lg leading-8 text-slate-400">
              Your destination for IPO research, stock market insights and
              financial intelligence — all in one place.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <a
                href="/ipos"
                className="rounded-xl bg-emerald-400 px-7 py-4 font-bold text-slate-950 transition hover:-translate-y-1 hover:bg-emerald-300"
              >
                Explore IPOs ↗
              </a>
              <a
                href="/stocks"
                className="rounded-xl border border-white/20 px-7 py-4 font-semibold text-white transition hover:border-emerald-400 hover:text-emerald-300"
              >
                Explore Markets
              </a>
            </div>

            <p className="mt-8 text-xs tracking-wide text-slate-500">
              RESEARCH · INFORMATION · MARKET INSIGHTS
            </p>
          </div>

          {/* Market overview panel */}
          <div className="rounded-3xl border border-white/10 bg-[#111a2b]/90 p-6 shadow-2xl shadow-black/30 sm:p-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-xs font-bold tracking-widest text-slate-500">
                  MARKET OVERVIEW
                </p>
                <h2 className="mt-2 text-xl font-semibold">Indian Markets</h2>
              </div>
              <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[10px] font-bold text-amber-300">
                DATA INTEGRATION
              </span>
            </div>

            {["NIFTY 50", "SENSEX", "BANK NIFTY"].map((item) => (
              <div
                key={item}
                className="flex items-center justify-between border-b border-white/10 py-6 last:border-0"
              >
                <div>
                  <p className="font-semibold">{item}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Market data connection pending
                  </p>
                </div>
                <span className="text-sm text-slate-500">—</span>
              </div>
            ))}

            <p className="mt-4 text-xs leading-5 text-slate-500">
              Market figures will appear here after verified data integration.
            </p>
          </div>
        </div>
      </section>

      {/* Main features */}
      <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-emerald-400">
              EXPLORE CAPITAL360IPO
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything you need to
              <br className="hidden sm:block" /> understand the market.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-7 text-slate-400">
            Research-focused tools and information designed to make financial
            markets easier to understand.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {features.map((feature) => (
            <a
              key={feature.number}
              href={feature.href}
              className="group rounded-2xl border border-white/10 bg-[#111a2b] p-7 transition duration-300 hover:-translate-y-2 hover:border-emerald-400/50 hover:bg-[#142237]"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-emerald-400">
                  {feature.number}
                </span>
                <span className="text-xs tracking-wider text-slate-500">
                  {feature.tag}
                </span>
              </div>
              <h3 className="mt-12 text-2xl font-semibold">{feature.title}</h3>
              <p className="mt-4 min-h-20 text-sm leading-7 text-slate-400">
                {feature.description}
              </p>
              <div className="mt-7 flex items-center justify-between border-t border-white/10 pt-5 text-sm font-semibold">
                <span className="text-slate-300 group-hover:text-emerald-300">
                  Explore section
                </span>
                <span className="text-xl text-emerald-400">↗</span>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Platform vision */}
      <section className="border-y border-white/10 bg-[#0d1524]">
        <div className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
          <p className="text-xs font-bold tracking-[0.2em] text-emerald-400">
            ONE FINANCIAL DESTINATION
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight sm:text-5xl">
            Built for today's research.
            <span className="text-emerald-400"> Ready for tomorrow.</span>
          </h2>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {platformAreas.map(([title, description]) => (
              <div
                key={title}
                className="rounded-xl border border-white/10 bg-[#111a2b] p-6"
              >
                <div className="mb-6 h-1 w-10 rounded-full bg-emerald-400" />
                <h3 className="text-sm font-bold tracking-wider text-white">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* IPO call to action */}
      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-8 rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 to-[#111a2b] p-8 sm:p-12 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-emerald-400">
              IPO RESEARCH CENTER
            </p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              Discover the IPO market.
            </h2>
            <p className="mt-4 max-w-xl leading-7 text-slate-400">
              Explore IPO information, issue timelines and company details
              through our dedicated IPO research section.
            </p>
          </div>
          <a
            href="/ipos"
            className="shrink-0 rounded-xl bg-emerald-400 px-7 py-4 font-bold text-slate-950 transition hover:bg-emerald-300"
          >
            View IPOs ↗
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#060b14]">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 px-5 py-12 sm:flex-row lg:px-8">
          <div>
            <a href="/" className="text-xl font-black tracking-tight">
              CAPITAL<span className="text-emerald-400">360</span>IPO
            </a>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
              Financial information and market research for informed
              understanding.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-400">
            <a href="/ipos" className="hover:text-emerald-400">IPOs</a>
            <a href="/news" className="hover:text-emerald-400">News</a>
            <a href="/stocks" className="hover:text-emerald-400">Stocks</a>
            <a href="/about" className="hover:text-emerald-400">About</a>
          </div>
        </div>

        <div className="border-t border-white/10 px-5 py-5 text-center text-xs text-slate-600">
          © {new Date().getFullYear()} Capital360IPO. Informational content
          only. Not investment advice.
        </div>
      </footer>
    </main>
  );
}
