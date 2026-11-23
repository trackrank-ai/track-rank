import type { CostExample } from "../lib/comparison-cost";
export type Competitor = {
  slug: string; name: string; url: string; home: string; angle: string; best: string; reason: string;
  trackrankFacts: (string | CostExample)[]; comparisonQuestions: number[]; alternativeHeading: string; alternativeVerdict: string;
  facts: string[][]; wins: string[]; winSource: string; tradeoff: string; migration: string; faqs: string[][];
  checkedAt: string; description: string; altDescription: string;
};
export const competitors: Competitor[] = [
  {
    "slug": "peec-ai",
    "name": "Peec AI",
    "url": "https://peec.ai/pricing",
    "home": "https://peec.ai/",
    "angle": "Open source vs a managed analytics package",
    "best": "a managed daily-monitoring package with brand-perception and action workflows",
    "reason": "Your question list is growing beyond a fixed prompt package, or you want to inspect and change the tracking code.",
    "facts": [
      [
        "Entry package",
        "Starter: $95/month; 50 prompts."
      ],
      [
        "Collection shape",
        "Three selected models, checked daily on Starter."
      ],
      [
        "Team access",
        "Unlimited users on brand plans."
      ],
      [
        "Larger package",
        "Pro: $245/month; 150 prompts."
      ],
      [
        "Highest listed brand tier",
        "Advanced: $495/month; 350 prompts."
      ]
    ],
    "wins": [
      "You want visibility, position and sentiment reporting in one managed product.",
      "Your team wants the published Actions workflow rather than building its own analysis process.",
      "The fixed daily three-model packages match your workload and you prefer one packaged service."
    ],
    "winSource": "https://peec.ai/",
    "tradeoff": "Choose a ready-made analytics workflow over source ownership.",
    "migration": "Copy the exact prompt wording, model selections, locations and tags from your Peec project into a local list; retain existing reports separately.",
    "faqs": [
      [
        "Will Trackrank AI replace every Peec workflow?",
        "No. Start with prompt monitoring and evidence review. Validate any sentiment, action or integration workflow separately before cancelling Peec."
      ],
      [
        "Is the $10 plan comparable to a $95 Peec subscription?",
        "Not by subscription price alone. Trackrank AI adds your provider bill; use the workload table and your actual provider rate."
      ]
    ],
    "checkedAt": "2026-11-23",
    "description": "Trackrank AI vs Peec AI: compare open-source control, your provider credentials, self-hosting, workload costs and the trade-offs before switching.",
    "altDescription": "Peec AI alternatives for teams that want open-source control, their own provider credentials or managed monitoring. Compare costs, strengths and trade-offs.",
    "trackrankFacts": [
      {
        "questions": 50
      },
      {
        "questions": 50
      },
      "Hosted plans have no per-seat fees; the organization shares its run allowance.",
      {
        "questions": 150
      },
      {
        "questions": 350
      }
    ],
    "alternativeHeading": "Peec AI alternatives for self-hosted tracking",
    "alternativeVerdict": "Peec AI packages daily collection around a fixed prompt allowance.",
    "comparisonQuestions": [
      50,
      150,
      350
    ]
  },
  {
    "slug": "ahrefs",
    "name": "Ahrefs Brand Radar",
    "url": "https://ahrefs.com/brand-radar",
    "home": "https://ahrefs.com/brand-radar",
    "angle": "Your own tracking stack vs an AI visibility index",
    "best": "search-backed discovery across an existing AI-answer index and the wider Ahrefs toolkit",
    "reason": "You need to collect a known set of buyer questions in your own stack, rather than pay for a broad discovery index.",
    "facts": [
      [
        "Custom tracking",
        "Prompt Tracking starts at $50/month."
      ],
      [
        "Index access",
        "AI Visibility Index starts at $199/month."
      ],
      [
        "Existing customers",
        "Paid Lite and higher plans include a prompt quota."
      ],
      [
        "Included Lite allowance",
        "Lite includes 150 checks/month."
      ],
      [
        "Check accounting",
        "A Claude update consumes eight checks."
      ]
    ],
    "wins": [
      "You need to discover topics from Ahrefs' pre-collected, search-backed answer index.",
      "You already pay for Ahrefs and its included prompt quota is enough.",
      "You want AI visibility connected to Ahrefs search-demand and wider SEO research."
    ],
    "winSource": "https://ahrefs.com/brand-radar",
    "tradeoff": "A broad discovery index is a different product from collecting your own prompt set.",
    "migration": "Copy your Custom Prompts wording, platform choices and cadence from Brand Radar. Keep any index research separately: Trackrank AI does not import or reproduce the Ahrefs index.",
    "faqs": [
      [
        "Does Trackrank AI replace the Ahrefs SEO suite?",
        "No. Trackrank AI monitors chosen AI questions; it is not a backlink index, keyword database or full Ahrefs replacement."
      ],
      [
        "Are Ahrefs checks equivalent to Trackrank AI runs?",
        "Not universally. Ahrefs has platform-specific check accounting; a Trackrank AI run is one prompt × one engine × one sample."
      ]
    ],
    "checkedAt": "2026-11-23",
    "description": "Trackrank AI vs Ahrefs Brand Radar: compare open-source control, your provider credentials, self-hosting, workload costs and the trade-offs before switching.",
    "altDescription": "Ahrefs Brand Radar alternatives: compare open-source tracking, provider credentials, self-hosting and managed monitoring, with sourced pricing and trade-offs.",
    "trackrankFacts": [
      {
        "questions": 50
      },
      "Trackrank AI collects questions you supply. It does not include an Ahrefs-style answer index.",
      "Self-hosting requires no Trackrank AI subscription or Ahrefs subscription.",
      {
        "questions": 5,
        "profile": "chatgpt"
      },
      "Trackrank AI collects ChatGPT, Gemini and Google AI Overviews, not Claude."
    ],
    "alternativeHeading": "Ahrefs Brand Radar alternatives for custom question tracking",
    "alternativeVerdict": "Ahrefs connects custom question tracking with an existing AI-answer index.",
    "comparisonQuestions": [
      50,
      150,
      350
    ]
  },
  {
    "slug": "profound",
    "name": "Profound",
    "url": "https://www.tryprofound.com/pricing",
    "home": "https://www.tryprofound.com/",
    "angle": "An open tracking stack vs an enterprise platform",
    "best": "enterprise governance, wider engine coverage and a dedicated support relationship",
    "reason": "You want a focused monitoring stack with visible software costs, instead of procuring an enterprise marketing package.",
    "facts": [
      [
        "Commercial model",
        "Enterprise pricing is custom."
      ],
      [
        "Engine coverage",
        "Enterprise advertises up to ten answer engines."
      ],
      [
        "Governance",
        "SSO/SAML is listed."
      ],
      [
        "Data access",
        "CSV and JSON exports are listed."
      ],
      [
        "Team access",
        "Unlimited seats are listed."
      ]
    ],
    "wins": [
      "Your procurement requires the published SSO/SAML and SOC 2 offering.",
      "You need more engine coverage than Trackrank AI's ChatGPT, Gemini and Google AI Overviews.",
      "You need dedicated support and an enterprise marketing-agent workflow."
    ],
    "winSource": "https://www.tryprofound.com/pricing",
    "tradeoff": "Enterprise controls and services are not interchangeable with a lean tracking tool.",
    "migration": "Retain your Profound CSV/JSON exports as historical records. Extract a reviewed question list, engine list and regions from the project; do not treat exported metrics as Trackrank AI run history.",
    "faqs": [
      [
        "Can you quantify savings against Profound?",
        "Not from a public custom quote. Compare your actual quote with Trackrank AI hosting plus provider usage, and account for the enterprise features you need."
      ],
      [
        "Is self-hosting equivalent to enterprise compliance?",
        "No. Owning the deployment does not supply SSO/SAML, a compliance attestation or a managed support SLA."
      ]
    ],
    "checkedAt": "2026-11-23",
    "description": "Trackrank AI vs Profound: compare open-source control, your provider credentials, self-hosting, workload costs and the trade-offs before switching.",
    "altDescription": "Profound alternatives for teams that want open-source control, their own provider credentials or managed monitoring. Compare costs, strengths and trade-offs.",
    "trackrankFacts": [
      {
        "questions": 50
      },
      "Three collection engines: ChatGPT, Gemini and Google AI Overviews.",
      "You operate authentication and infrastructure for a self-hosted Cloudflare deployment.",
      "CSV exports, REST API and MCP access use organization permissions.",
      "Additional seat fees: $0. Workspaces share organization limits."
    ],
    "alternativeHeading": "Profound alternatives for teams running their own tracking",
    "alternativeVerdict": "Profound packages monitoring with SSO/SAML and dedicated support.",
    "comparisonQuestions": [
      50,
      150,
      350
    ]
  },
  {
    "slug": "promptwatch",
    "name": "Promptwatch",
    "url": "https://promptwatch.com/pricing",
    "home": "https://promptwatch.com/",
    "angle": "Bring your own credentials vs a broader GEO suite",
    "best": "broader model coverage, agent chat and integrated content workflows",
    "reason": "You need economical repeated monitoring and code-level control, without buying a broader content-operations platform.",
    "facts": [
      [
        "Entry package",
        "Essential: $95/month; 50 prompts."
      ],
      [
        "Response allowance",
        "Essential lists 6,000 responses."
      ],
      [
        "Agent access",
        "Essential includes API and MCP access."
      ],
      [
        "Team access",
        "Essential lists unlimited seats."
      ],
      [
        "Content workflow",
        "Professional: $245/month, with content writing and refresh."
      ]
    ],
    "wins": [
      "You need its wider published model list, including Perplexity and Copilot.",
      "You want content creation and refresh within the paid marketing workflow.",
      "You need the Business plan's published city/state tracking and shopping tools."
    ],
    "winSource": "https://promptwatch.com/pricing",
    "tradeoff": "Model coverage and content workflows can matter more than raw collection volume.",
    "migration": "Copy prompt wording, country settings and model choices from your Promptwatch project. Flag any models not supported by Trackrank AI before recreating monitoring.",
    "faqs": [
      [
        "Does Trackrank AI support all Promptwatch models?",
        "No. Trackrank AI currently collects ChatGPT, Gemini and Google AI Overviews through DataForSEO. Check coverage before switching."
      ],
      [
        "Does bringing my own key mean my OpenAI API key?",
        "For Trackrank AI collection, it means your own DataForSEO credentials. Optional OpenRouter analysis uses a separate credential. It is not a generic arbitrary-model API-key connector."
      ]
    ],
    "checkedAt": "2026-11-23",
    "description": "Trackrank AI vs Promptwatch: compare open-source control, your provider credentials, self-hosting, workload costs and the trade-offs before switching.",
    "altDescription": "Promptwatch alternatives for teams that want open-source control, their own provider credentials or managed monitoring. Compare costs, strengths and trade-offs.",
    "trackrankFacts": [
      {
        "questions": 50
      },
      {
        "questions": 50
      },
      "REST API and MCP access use the same organization permissions as the app.",
      "Additional seat fees: $0.",
      {
        "questions": 150
      }
    ],
    "alternativeHeading": "Promptwatch alternatives for monitoring with your own credentials",
    "alternativeVerdict": "Promptwatch combines question tracking with agent chat and content workflows.",
    "comparisonQuestions": [
      50,
      150,
      350
    ]
  },
  {
    "slug": "otterly-ai",
    "name": "OtterlyAI",
    "url": "https://otterly.ai/pricing",
    "home": "https://otterly.ai/",
    "angle": "Run-based control vs a managed credit package",
    "best": "a small managed starting package or a workflow needing its broader engine selection",
    "reason": "You want to control collection spending directly, customize the application or separate hosting from usage as monitoring grows.",
    "facts": [
      [
        "Entry package",
        "Lite: €29/month."
      ],
      [
        "Entry allowance",
        "Lite lists 2,000 credits/month."
      ],
      [
        "Illustrative coverage",
        "Lite illustrates 16 prompts on four engines, daily."
      ],
      [
        "Team access",
        "All plans include unlimited team members."
      ],
      [
        "Larger package",
        "Standard: €189/month; 15,000 credits."
      ]
    ],
    "wins": [
      "A small daily-monitoring package meets your needs without provider-account setup.",
      "You need its published engine selection beyond Trackrank AI's three collection engines.",
      "You want its managed optimization and onboarding workflow."
    ],
    "winSource": "https://otterly.ai/pricing",
    "tradeoff": "Credits and currency need normalization before comparing prices.",
    "migration": "Copy your search prompts, countries, chosen engines and tracking frequency from OtterlyAI. Keep existing brand reports separately and identify engine gaps before collecting.",
    "faqs": [
      [
        "Is €29 more expensive than Trackrank AI?",
        "Not necessarily. Currencies, credit weights, engine coverage and provider usage differ; this page makes no currency conversion or blanket savings claim."
      ],
      [
        "Are Otterly credits the same as Trackrank AI runs?",
        "No. Check Otterly's current engine-credit rules. Trackrank AI counts one prompt × one engine × one sample as one run."
      ]
    ],
    "checkedAt": "2026-11-23",
    "description": "Trackrank AI vs OtterlyAI: compare open-source control, your provider credentials, self-hosting, workload costs and the trade-offs before switching.",
    "altDescription": "OtterlyAI alternatives for teams that want open-source control, their own provider credentials or managed monitoring. Compare costs, strengths and trade-offs.",
    "trackrankFacts": [
      {
        "questions": 16
      },
      {
        "questions": 16
      },
      {
        "questions": 16
      },
      "Additional seat fees: $0.",
      {
        "questions": 120
      }
    ],
    "alternativeHeading": "OtterlyAI alternatives for run-based monitoring",
    "alternativeVerdict": "OtterlyAI prices monitoring through monthly credits.",
    "comparisonQuestions": [
      16,
      120,
      403
    ]
  }
];
export const competitorBySlug = (slug: string) => competitors.find(item => item.slug === slug);
export const comparisonPaths = ["/vs", "/alternatives", ...competitors.flatMap(item => [`/vs/${item.slug}`, `/alternatives/${item.slug}`])];
