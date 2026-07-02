// Quick way to see the UI working before wiring it to your real backend.
// Run:  node test-sse-server.mjs
// Then set VITE_SSE_URL=http://localhost:8787/stream in your .env

import http from 'node:http';

const PORT = 8787;
const clients = new Set();

const SAMPLE_FILINGS = [
  {
    company_symbol: 'ECLERX',
    filing_date: 'June 23, 2026',
    has_material_development: false,
    facts: [
      {
        subject_entity: 'Investor Meeting Schedule',
        reporting_period: null,
        event_category: 'Business_Operational_Update',
        alert_message:
          'eClerx just announced a schedule for an investor meeting with Avendus Spark Institutional Equities today, focusing on industry and company-specific developments.',
        page_number: 1,
        verbatim_source_quote:
          'Pursuant to Regulation 30 of the Listing Regulations, the schedule of investor meeting with the Company is given below:',
      },
    ],
  },
  {
    company_symbol: 'TCS',
    filing_date: 'June 23, 2026',
    has_material_development: true,
    facts: [
      {
        subject_entity: 'Quarterly Results',
        reporting_period: 'Q1 FY27',
        event_category: 'Quarterly_Result',
        alert_message:
          'TCS reports 14% YoY revenue growth, beating analyst estimates, with AI services contributing 22% of net new bookings.',
        page_number: 2,
        verbatim_source_quote:
          'The Board of Directors approved the unaudited financial results for the quarter ended June 30, 2026.',
      },
    ],
  },
  {
    company_symbol: 'INFY',
    filing_date: 'June 23, 2026',
    has_material_development: true,
    facts: [
      {
        subject_entity: 'Management Change',
        reporting_period: null,
        event_category: 'Resignation',
        alert_message:
          'Infosys COO steps down citing personal reasons; the board has begun the search for a successor.',
        page_number: 1,
        verbatim_source_quote:
          'The Company wishes to inform that the COO has tendered his resignation with immediate effect.',
      },
    ],
  },
];

const server = http.createServer((req, res) => {
  if (req.url === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  res.writeHead(404).end();
});

let i = 0;
setInterval(() => {
  const filing = SAMPLE_FILINGS[i % SAMPLE_FILINGS.length];
  i += 1;
  const payload = `data: ${JSON.stringify(filing)}\n\n`;
  for (const res of clients) res.write(payload);
}, 6000);

server.listen(PORT, () => {
  console.log(`Test SSE server running at http://localhost:${PORT}/stream`);
});