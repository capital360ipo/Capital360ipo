
"use client";

type IPOAdditionalSectionsProps = {
  companyName: string;
  openDate: string | null;
  closeDate: string | null;
  allotmentDate: string | null;
  refundDate: string | null;
  shareCreditDate: string | null;
  listingDate: string | null;
};

function formatDate(date: string | null) {
  if (!date) return "Awaiting Official Update";

  const parsed = new Date(date + "T00:00:00");

  if (Number.isNaN(parsed.getTime())) {
    return "Awaiting Official Update";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function TimelineItem({
  number,
  title,
  date,
  description,
}: {
  number: string;
  title: string;
  date: string | null;
  description: string;
}) {
  const available = Boolean(date);

  return (
    <article className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-emerald-400/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-sm font-black text-emerald-300">
            {number}
          </span>
          <div>
            <h3 className="font-bold text-white">{title}</h3>
            <p className="mt-1 text-xs text-slate-500">{description}</p>
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
            available
              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
              : "border-amber-400/20 bg-amber-400/10 text-amber-300"
          }`}
        >
          {available ? "Available" : "Pending"}
        </span>
      </div>

      <p className="mt-5 border-t border-white/10 pt-4 text-lg font-extrabold text-emerald-300">
        {formatDate(date)}
      </p>
    </article>
  );
}

const faqs = [
  {
    question: "What is an IPO?",
    answer:
      "An Initial Public Offering (IPO) is the process through which a company offers its shares to the public for the first time and may become listed on a recognised stock exchange.",
  },
  {
    question: "How can I apply for this IPO?",
    answer:
      "Investors can generally apply through supported broker platforms, bank ASBA facilities or other permitted application channels during the IPO bidding period. Check the official offer documents and your intermediary for eligibility and application instructions.",
  },
  {
    question: "How is IPO allotment decided?",
    answer:
      "Allotment is carried out according to the applicable regulatory framework and the final basis of allotment approved for the issue. The outcome depends on the category, valid applications and subscription.",
  },
  {
    question: "Where can I check IPO allotment status?",
    answer:
      "After the basis of allotment is finalised, investors can check their application status through the registrar's official website or other official channels announced for the IPO.",
  },
  {
    question: "When will the IPO refund be initiated?",
    answer:
      "Refund or unblock timelines depend on the issue schedule and applicable processing. Refer to the official IPO timetable and your bank or application intermediary for the latest status.",
  },
  {
    question: "When will shares be credited to the demat account?",
    answer:
      "Shares are generally credited to successful allottees' demat accounts according to the official issue schedule. The actual status should be confirmed with the registrar or depository participant.",
  },
  {
    question: "Is Grey Market Premium (GMP) guaranteed?",
    answer:
      "No. GMP is unofficial, speculative market information. It is not regulated as an official IPO price indicator and does not guarantee listing gains or investment returns.",
  },
  {
    question: "Where can I read official IPO documents?",
    answer:
      "Investors should refer to the issuer's official offer documents, such as the Draft Red Herring Prospectus (DRHP), Red Herring Prospectus (RHP) and Prospectus, along with relevant SEBI and exchange disclosures.",
  },
];

export default function IPOAdditionalSections({
  companyName,
  openDate,
  closeDate,
  allotmentDate,
  refundDate,
  shareCreditDate,
  listingDate,
}: IPOAdditionalSectionsProps) {
  const timeline = [
    {
      number: "01",
      title: "IPO Opening",
      date: openDate,
      description: "Bidding start date",
    },
    {
      number: "02",
      title: "IPO Closing",
      date: closeDate,
      description: "Last date for bidding",
    },
    {
      number: "03",
      title: "Allotment",
      date: allotmentDate,
      description: "Basis of allotment finalisation",
    },
    {
      number: "04",
      title: "Refund Initiation",
      date: refundDate,
      description: "Refund or fund unblocking",
    },
    {
      number: "05",
      title: "Demat Credit",
      date: shareCreditDate,
      description: "Share credit for successful allottees",
    },
    {
      number: "06",
      title: "Listing",
      date: listingDate,
      description: "Expected exchange listing schedule",
    },
  ];

  return (
    <>
      <section className="mt-12" id="allotment-listing">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
            Issue Schedule
          </p>
          <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">
            Allotment & Listing Timeline
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            Important issue milestones for {companyName}, based on the dates
            available in the IPO database.
          </p>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {timeline.map((item) => (
            <TimelineItem key={item.number} {...item} />
          ))}
        </div>

        <p className="mt-4 text-xs leading-6 text-slate-500">
          Dates are displayed from the available IPO record. Pending dates will
          be updated when official information is available. Always verify the
          final schedule through the issuer, registrar and stock exchange.
        </p>
      </section>

      <section className="mt-12" id="ipo-faqs">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
            Investor Help Centre
          </p>
          <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            Important information about {companyName}, IPO applications,
            allotment, refunds and listing.
          </p>
        </div>

        <div className="mt-7 space-y-3">
          {faqs.map((faq, index) => (
            <details
              key={faq.question}
              className="group rounded-2xl border border-white/10 bg-[#101a2b] p-5 transition hover:border-emerald-400/30"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-white marker:hidden">
                <span className="flex items-start gap-3">
                  <span className="text-sm font-black text-emerald-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{faq.question}</span>
                </span>
                <span className="shrink-0 text-xl text-emerald-400 transition group-open:rotate-45">
                  +
                </span>
              </summary>

              <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-7 text-slate-400">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>

        <p className="mt-4 text-xs leading-6 text-slate-500">
          These FAQs provide general educational information and are not
          personalised investment, legal or tax advice.
        </p>
      </section>
    </>
  );
}
