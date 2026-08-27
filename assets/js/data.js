/* =============================================================================
   SITE CONTENT - single source of truth.
   Edit ONLY this file to add a project, skill, job, degree or link.
   Nothing here is hard-coded into the UI; every list below renders itself.
   ============================================================================= */

const SITE = {

  /* --------------------------------------------------------------------- */
  /* 1. IDENTITY                                                            */
  /* --------------------------------------------------------------------- */
  person: {
    name: "Md. Rahat Hossain",
    monogram: "RH",
    eyebrow: "Civil Engineer × Technology",
    role: "Civil Engineer & Technology Professional",
    tagline: "Civil Engineer building smarter infrastructure with digital technology.",
    intro:
      "I work across water & sanitation infrastructure, site engineering and construction " +
      "monitoring - and I bring GIS, CAD, data workflows and modern AI tooling into that work " +
      "so projects are easier to design, track and decide on.",
    location: "Dhaka, Bangladesh",
    // Replace with your own photo at assets/img/profile.jpg (square, ~800x800px).
    // If the file is missing the site falls back to the monogram mark automatically.
    photo: "assets/img/profile.jpg",
    photoAlt: "Portrait of Md. Rahat Hossain",
    resume: "" // e.g. "assets/Md-Rahat-Hossain-CV.pdf" - leave "" to hide the button
  },

  /* --------------------------------------------------------------------- */
  /* 2. CONTACT + SOCIAL                                                    */
  /* --------------------------------------------------------------------- */
  contact: {
    email: "rahat.zdn@gmail.com",
    phoneLabel: "+880 1706 735151",
    whatsapp: "https://wa.me/8801706735151",
    location: "Dhaka, Bangladesh"
  },

  socials: [
    { id: "linkedin", label: "LinkedIn", handle: "md-rahathossain",     url: "https://www.linkedin.com/in/md-rahathossain", icon: "linkedin" },
    { id: "github",   label: "GitHub",   handle: "rahatce98",           url: "https://github.com/rahatce98",                icon: "github" },
    { id: "x",        label: "X",        handle: "@RahatZdn",           url: "https://x.com/RahatZdn",                      icon: "x" },
    { id: "whatsapp", label: "WhatsApp", handle: "+880 1706 735151",    url: "https://wa.me/8801706735151",                 icon: "whatsapp" },
    { id: "email",    label: "Email",    handle: "rahat.zdn@gmail.com", url: "mailto:rahat.zdn@gmail.com",                  icon: "mail" }
  ],

  /* --------------------------------------------------------------------- */
  /* 3. ABOUT                                                               */
  /* --------------------------------------------------------------------- */
  about: {
    lead:
      "I am a civil engineer from Bangladesh working on infrastructure that people rely on every " +
      "day - water distribution and sewerage networks, pipelines, and the construction work that " +
      "puts them in the ground.",
    body: [
      "My day-to-day is site supervision, profile and depth checking, progress and quantity " +
      "monitoring, coordination and technical documentation. That work taught me where " +
      "infrastructure projects actually lose time: not in design, but in how information moves.",
      "So I started closing that gap with technology - GIS for spatial context, CAD for design, " +
      "spreadsheets and scripts for monitoring, digital field forms instead of paper, and " +
      "AI-assisted tooling to build the small systems a project actually needs."
    ],
    pillars: [
      {
        icon: "hardhat",
        title: "Engineering",
        text: "Civil engineering, infrastructure, water distribution, sewerage, construction supervision and technical documentation."
      },
      {
        icon: "layers",
        title: "Digital Engineering",
        text: "GIS, AutoCAD, engineering software, Excel automation, digital field data collection and project monitoring."
      },
      {
        icon: "spark",
        title: "Emerging Technology",
        text: "AI, machine learning, web applications, automation and modern developer tools."
      }
    ]
  },

  /* --------------------------------------------------------------------- */
  /* 4. EXPERTISE - add a group or a single item freely                     */
  /* --------------------------------------------------------------------- */
  expertise: [
    {
      icon: "hardhat",
      title: "Civil & Infrastructure",
      items: [
        "Water Distribution Networks", "Sewerage Networks", "Pipe Network Projects",
        "Site Supervision", "Construction Monitoring", "Quantity & Progress Monitoring",
        "Technical Documentation"
      ]
    },
    {
      icon: "compass",
      title: "Engineering Software",
      items: [
        "AutoCAD", "ArcGIS", "WaterGEMS", "SewerGEMS",
        "MS Project", "MS Excel", "MS Visio", "Google Earth Pro"
      ]
    },
    {
      icon: "chart",
      title: "Digital & Data",
      items: [
        "Excel VBA", "Power Query", "Power Pivot", "KoboToolbox",
        "SW Maps", "Data Visualization", "Dashboard Development"
      ]
    },
    {
      icon: "spark",
      title: "Technology",
      items: [
        "AI Tools", "Vibe Coding", "Web Development", "Automation",
        "Python", "Git / GitHub", "AI-assisted development"
      ]
    }
  ],

  /* --------------------------------------------------------------------- */
  /* 5. ENGINEERING x TECHNOLOGY - the positioning chain                    */
  /* --------------------------------------------------------------------- */
  chain: {
    heading: "Where Engineering Meets Technology",
    lead:
      "Domain knowledge is what makes technology useful on an infrastructure project. " +
      "My long-term direction is to combine both - so that projects are designed, monitored, " +
      "analysed and managed with better information.",
    steps: [
      { label: "Civil Engineering", note: "Domain knowledge, standards, judgement" },
      { label: "Infrastructure",    note: "Networks, pipelines, structures, sites" },
      { label: "Data",              note: "Field records, quantities, progress" },
      { label: "GIS",               note: "Spatial context and network geometry" },
      { label: "Automation",        note: "Repeatable workflows instead of manual work" },
      { label: "AI",                note: "Assisted analysis, drafting and tooling" },
      { label: "Smarter Decisions", note: "Faster, better-informed project control", accent: true }
    ]
  },

  /* --------------------------------------------------------------------- */
  /* 6. EXPERIENCE                                                          */
  /* --------------------------------------------------------------------- */
  experience: [
    {
      role: "Assistant Engineer",
      org: "PRAN-RFL Group",
      place: "Bangladesh",
      period: "2023 — Present",
      type: "Full-time",
      summary:
        "Site and project engineering on infrastructure construction, with a focus on pipe network " +
        "works, progress control and technical documentation.",
      points: [
        "Site supervision and infrastructure construction monitoring",
        "Pipe laying supervision, profile and depth checking",
        "Progress tracking and quantity monitoring",
        "Technical documentation and project reporting",
        "Coordination between site, design and management",
        "Engineering design support using AutoCAD and GIS"
      ]
    },
    {
      role: "Engineering Intern",
      org: "Barind Multipurpose Development Authority",
      place: "Bangladesh",
      period: "2022 — 2023",
      type: "Internship",
      summary:
        "Engineering and GIS support for regional development work, including mapping, drafting and " +
        "technical reporting.",
      points: [
        "GIS mapping and spatial data work for regional development projects",
        "AutoCAD drafting for infrastructure and development planning",
        "Field survey support and data collection",
        "Technical documentation and report preparation"
      ]
    }
  ],

  /* --------------------------------------------------------------------- */
  /* 7. EDUCATION                                                           */
  /* --------------------------------------------------------------------- */
  education: [
    {
      degree: "M.Sc. in Environment and Disaster Management",
      school: "Jagannath University",
      place: "Dhaka, Bangladesh",
      note: "Environmental systems, disaster risk and resilience planning."
    },
    {
      degree: "B.Sc. in Civil Engineering",
      school: "Bangladesh Army University of Engineering & Technology",
      place: "Bangladesh",
      note: "Structural, geotechnical, transportation and water resources engineering."
    }
  ],

  /* --------------------------------------------------------------------- */
  /* 8. PROJECTS                                                            */
  /* Add an object here and the card + filter appear automatically.         */
  /* art: geometric | network | grid | contour | flow | signal              */
  /* links: omit a key entirely and that button is hidden.                  */
  /* --------------------------------------------------------------------- */
  projectCategories: [
    "All", "Infrastructure Engineering", "Project Monitoring", "Field Data",
    "GIS & Mapping", "Digital Engineering"
  ],

  projects: [
    {
      title: "WD6B Dynamic Progress Tracker",
      category: "Project Monitoring",
      badge: "Engineering Tool",
      art: "grid",
      description:
        "A progress monitoring system for a sewer network package. Records work by segment, " +
        "in-charge, activity and date, compares it against programme, and turns daily site " +
        "entries into a progress picture the team can act on.",
      role: "Design, build and day-to-day use",
      tech: ["Google Sheets", "Apps Script", "Web App", "Data Modelling"],
      links: {}
    },
    {
      title: "Sewer Network Construction Supervision",
      category: "Infrastructure Engineering",
      badge: "Professional Work",
      art: "network",
      description:
        "Site supervision on sewerage and pipe network construction - pipe laying, profile and " +
        "depth verification, quantity monitoring and daily technical documentation.",
      role: "Assistant Engineer, site",
      tech: ["Site Supervision", "Levelling", "AutoCAD", "Quantity Monitoring"],
      links: {}
    },
    {
      title: "Site Reporting & Quantity Workbook",
      category: "Digital Engineering",
      badge: "Engineering Tool",
      art: "flow",
      description:
        "A structured Excel system for site reporting and quantity tracking - validated entry " +
        "sheets, Power Query cleanup and pivot-driven summaries, replacing repeated manual " +
        "consolidation.",
      role: "Design and build",
      tech: ["Excel", "Power Query", "Power Pivot", "VBA"],
      links: {}
    },
    {
      title: "Delay Event Survey — EoT Claim Support",
      category: "Field Data",
      badge: "Engineering Tool",
      art: "signal",
      description:
        "A structured digital survey for capturing delay events on site, built to feed an " +
        "extension-of-time and prolongation claim with consistent, attributable records instead " +
        "of scattered notes.",
      role: "Form design and data structure",
      tech: ["Google Forms", "Google Sheets", "Claim Documentation"],
      links: {}
    },
    {
      title: "GIS Mapping for Regional Development",
      category: "GIS & Mapping",
      badge: "Professional Work",
      art: "contour",
      description:
        "Spatial mapping and drafting support for regional development planning - building and " +
        "maintaining map layers, and preparing outputs used in planning and reporting.",
      role: "Engineering / GIS support",
      tech: ["ArcGIS", "AutoCAD", "Google Earth Pro", "Field Survey"],
      links: {}
    },
    {
      title: "TradeJournal Pro",
      category: "Digital Engineering",
      badge: "Personal Project",
      art: "geometric",
      description:
        "A self-built trading journal web application - logging trades, tracking performance over " +
        "time and reviewing decisions. Built to learn modern full-stack development end to end.",
      role: "Solo build",
      tech: ["TypeScript", "Next.js", "Prisma", "Web App"],
      links: {}
    }
  ],

  /* --------------------------------------------------------------------- */
  /* 9. TECHNOLOGY LAB - what I'm actively learning                         */
  /* status: exploring | learning | building                                */
  /* --------------------------------------------------------------------- */
  lab: {
    note: "Always learning. Always building.",
    items: [
      { name: "Artificial Intelligence", status: "learning"  },
      { name: "Machine Learning",        status: "exploring" },
      { name: "Python",                  status: "learning"  },
      { name: "Web Development",         status: "building"  },
      { name: "AI-assisted Coding",      status: "building"  },
      { name: "Automation",              status: "building"  },
      { name: "Data Analytics",          status: "learning"  },
      { name: "Advanced GIS",            status: "learning"  },
      { name: "Engineering Software",    status: "learning"  },
      { name: "Cloud Tools",             status: "exploring" }
    ]
  },

  /* --------------------------------------------------------------------- */
  /* 10. NOW - update this often, it is the freshest part of the site       */
  /* --------------------------------------------------------------------- */
  now: {
    updated: "August 2026",
    items: [
      "Building engineering productivity tools for day-to-day site work",
      "Improving project progress monitoring and reporting workflows",
      "Learning AI-assisted development and applying it to real problems",
      "Exploring automation for repetitive engineering documentation",
      "Sharpening GIS workflows for network and infrastructure data"
    ]
  },

  /* --------------------------------------------------------------------- */
  /* 11. CAPABILITY STRIP (statements, not invented numbers)                */
  /* --------------------------------------------------------------------- */
  capabilities: [
    { k: "Field",    v: "Site & construction supervision" },
    { k: "Networks", v: "Water distribution & sewerage" },
    { k: "Digital",  v: "GIS, CAD & data workflows" },
    { k: "Building", v: "Automation & AI-assisted tools" }
  ],

  /* --------------------------------------------------------------------- */
  /* 12. SEO                                                                */
  /* --------------------------------------------------------------------- */
  seo: {
    title: "Md. Rahat Hossain | Civil Engineer & Technology Professional",
    description:
      "Civil Engineer specializing in infrastructure, water and sanitation networks, GIS, " +
      "digital engineering and emerging technology.",
    // Set this after deploying, e.g. "https://rahatce98.github.io/portfolio/"
    canonical: "https://rahatce98.github.io/portfolio/"
  }
};

if (typeof window !== "undefined") window.SITE = SITE;
