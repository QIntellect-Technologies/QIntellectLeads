import { id } from './db'
import { addDaysISO, computePriority, normalizePhone } from '../shared/leads'
import type { LeadStatusKey } from '../shared/leads'

const DAY = 86_400_000
const iso = (days: number) => addDaysISO(days)
const stamp = (days: number, hour = 11) => `${iso(days)}T${String(hour).padStart(2, '0')}:30:00.000Z`

interface SeedNote {
  days: number
  channel: string
  outcome: string
  note: string
}

interface SeedLead {
  code: string
  created: number
  source: string
  product: string
  status: LeadStatusKey
  org: string
  orgType: string
  city: string
  headcount: number
  existing: string
  contact: string
  phone: string
  designation: string
  b2b?: boolean
  summary: string
  details?: string
  objection?: string
  lossReason?: string
  remarks?: string
  notes: SeedNote[]
  followUps?: { days: number; time?: string }[]
  meetings?: { days: number; time: string; type: string; status: string; notes?: string }[]
}

const leads: SeedLead[] = [
  {
    code: 'QT-001',
    created: 34,
    source: 'Meta Ads',
    product: 'AI Attendance System',
    status: 'negotiation',
    org: 'Beaconhouse Model School',
    orgType: 'School',
    city: 'Lahore',
    headcount: 820,
    existing: 'Manual registers + Excel',
    contact: 'Maya Chen',
    phone: '+923004561201',
    designation: 'Principal',
    summary: 'Attendance for 3 campuses with parent SMS alerts.',
    details: 'Three campuses, 820 students, 64 staff. Wants biometric plus face recognition at the main gate.',
    objection: 'Pricing',
    remarks: 'Board approval expected this week. Compare against the quote for 3 campuses.',
    notes: [
      { days: 22, channel: 'Call', outcome: 'Connected', note: 'Intro call. They want parent SMS alerts and a monthly attendance report.' },
      { days: 15, channel: 'WhatsApp', outcome: 'Demo booked', note: 'Sent the 3-campus proposal. Fee comparison with manual registers was the main question.' },
      { days: 20, channel: 'Meeting', outcome: 'Negotiation', note: 'Demo went well. They asked for a 5% annual discount and implementation in two phases.' },
    ],
    followUps: [{ days: -2, time: '10:30' }, { days: 3, time: '11:00' }],
    meetings: [{ days: 0, time: '11:00', type: 'Demo', status: 'Scheduled', notes: 'Second demo for the finance committee.' }],
  },
  {
    code: 'QT-002',
    created: 28,
    source: 'WhatsApp',
    product: 'GPS Tracking',
    status: 'proposal_sent',
    org: 'Sadaf Textile Mills',
    orgType: 'Factory',
    city: 'Faisalabad',
    headcount: 430,
    existing: 'None',
    contact: 'Arjun Patel',
    phone: '+923217719908',
    designation: 'Transport Manager',
    summary: 'Track 45 delivery trucks and 6 staff vans.',
    details: 'Need geofencing around the plant, fuel reports and a 60-day playback history.',
    objection: 'Existing system',
    notes: [
      { days: 12, channel: 'WhatsApp', outcome: 'Proposal sent', note: 'Sent the quote for 51 vehicles with installation. Waiting on procurement.' },
      { days: 26, channel: 'Call', outcome: 'Connected', note: 'They moved from another vendor last year and want to see reliability data.' },
    ],
    followUps: [{ days: 0, time: '15:00' }],
    meetings: [{ days: 0, time: '15:30', type: 'Technical', status: 'Scheduled', notes: 'Review tracker wiring on two sample trucks.' }],
  },
  {
    code: 'QT-003',
    created: 19,
    source: 'Referral',
    product: 'HR / Payroll',
    status: 'demo_scheduled',
    org: 'Al-Shifa Hospital',
    orgType: 'Hospital',
    city: 'Karachi',
    headcount: 560,
    existing: 'Excel payroll',
    contact: 'Grace Whitfield',
    phone: '+923331124470',
    designation: 'HR Manager',
    summary: 'Payroll for 560 staff with shift allowances and overtime.',
    details: 'Three shift patterns, EOBI and tax deductions, and a self-service portal for payslips.',
    objection: 'Needs management approval',
    notes: [
      { days: 6, channel: 'Call', outcome: 'Demo scheduled', note: 'HR head wants a demo for payroll and the overtime calculation before the finance director signs off.' },
    ],
    followUps: [{ days: 2, time: '12:00' }],
    meetings: [{ days: 2, time: '12:30', type: 'Demo', status: 'Scheduled' }],
  },
  {
    code: 'QT-004',
    created: 24,
    source: 'Meta Ads (40%)',
    product: 'AI Chatbot',
    status: 'connected',
    org: 'Metro Cash & Carry',
    orgType: 'Retail',
    city: 'Islamabad',
    headcount: 210,
    existing: 'Facebook inbox',
    contact: 'Ravi Menon',
    phone: '+923011170045',
    designation: 'Digital Marketing Lead',
    summary: 'WhatsApp bot for product queries and store timings.',
    notes: [{ days: 4, channel: 'WhatsApp', outcome: 'Follow-up required', note: 'Explained the bot flows. He will share the top 20 customer questions this week.' }],
    followUps: [{ days: 1, time: '09:30' }],
  },
  {
    code: 'QT-005',
    created: 21,
    source: 'Referral',
    product: 'HR / Payroll',
    status: 'connected',
    org: 'Systems Limited',
    orgType: 'Office',
    city: 'Lahore',
    headcount: 190,
    existing: 'In-house tool',
    contact: 'Lena Fischer',
    phone: '+923451119872',
    designation: 'People Operations',
    summary: 'Leave management and payroll integration with their HRIS.',
    objection: 'Integration',
    notes: [{ days: 18, channel: 'Call', outcome: 'Follow-up required', note: 'Needs an API-level integration plan before moving forward. No reply since the last call.' }],
    followUps: [{ days: -6, time: '14:00' }],
  },
  {
    code: 'QT-006',
    created: 30,
    source: 'Meta Ads',
    product: 'AI Attendance System',
    status: 'demo_done',
    org: 'The City School',
    orgType: 'School',
    city: 'Rawalpindi',
    headcount: 1100,
    existing: 'Card machines',
    contact: 'Sofia Marin',
    phone: '+923008877651',
    designation: 'Campus Coordinator',
    summary: 'Replace ageing card machines at two campuses.',
    notes: [
      { days: 3, channel: 'Meeting', outcome: 'Trial requested', note: 'Demo done. They want a two-week trial with 50 staff before the full rollout.' },
      { days: 10, channel: 'Email', outcome: 'Demo done', note: 'Shared the trial checklist and device list.' },
    ],
    followUps: [{ days: 4, time: '10:00' }],
  },
  {
    code: 'QT-007',
    created: 12,
    source: 'WhatsApp',
    product: 'GPS Tracking',
    status: 'contacted',
    org: 'Fauji Foods',
    orgType: 'Factory',
    city: 'Okara',
    headcount: 380,
    existing: 'None',
    contact: 'Daniel Okafor',
    phone: '+923221234890',
    designation: 'Fleet Supervisor',
    summary: 'Track milk collection vehicles on rural routes.',
    notes: [{ days: 2, channel: 'Call', outcome: 'No answer', note: 'Called twice, no answer. Sent an intro on WhatsApp.' }],
    followUps: [{ days: 0, time: '16:00' }],
  },
  {
    code: 'QT-008',
    created: 3,
    source: 'Website',
    product: 'AI Chatbot',
    status: 'new',
    org: 'Kababjees Restaurants',
    orgType: 'Restaurant',
    city: 'Karachi',
    headcount: 240,
    existing: 'None',
    contact: 'Inês Carvalho',
    phone: '+923421198733',
    designation: 'Operations Manager',
    summary: 'WhatsApp ordering bot for 12 branches.',
    notes: [],
    followUps: [{ days: 2 }],
  },
  {
    code: 'QT-009',
    created: 41,
    source: 'Referral',
    product: 'AI Attendance System',
    status: 'postponed',
    org: 'Darul Madinah',
    orgType: 'School',
    city: 'Multan',
    headcount: 300,
    existing: 'Manual registers',
    contact: 'Yuki Tanaka',
    phone: '+923006554412',
    designation: 'Administrator',
    summary: 'Attendance for primary section.',
    remarks: 'Postponed for a family reason. Do not send pricing or discount scripts; check back after Eid.',
    notes: [{ days: 13, channel: 'Call', outcome: 'Postponed', note: 'Owner is dealing with a family matter. Asked us to call back next month.' }],
    followUps: [{ days: 14, time: '11:00' }],
  },
  {
    code: 'QT-010',
    created: 50,
    source: 'Meta Ads',
    product: 'HR / Payroll',
    status: 'won',
    org: 'Nishat Mills',
    orgType: 'Factory',
    city: 'Lahore',
    headcount: 1400,
    existing: 'Excel payroll',
    contact: 'Omar Haddad',
    phone: '+923019990023',
    designation: 'HR Director',
    summary: 'Payroll for 1,400 workers across two units.',
    notes: [
      { days: 30, channel: 'Meeting', outcome: 'Closed Won', note: 'Signed the annual contract. Kickoff scheduled with their HR team.' },
      { days: 45, channel: 'Call', outcome: 'Connected', note: 'Confirmed budget for this financial year.' },
    ],
    followUps: [],
  },
  {
    code: 'QT-011',
    created: 46,
    source: 'Referral',
    product: 'GPS Tracking',
    status: 'lost',
    org: 'Himalaya Foods',
    orgType: 'Factory',
    city: 'Gujranwala',
    headcount: 260,
    existing: 'Local tracker',
    contact: 'Marcus Hall',
    phone: '+923007741230',
    designation: 'Admin Manager',
    summary: 'Track 18 vehicles.',
    lossReason: 'Price too high',
    notes: [{ days: 25, channel: 'Call', outcome: 'Closed Lost', note: 'Chose a cheaper local tracker. Price was the only objection.' }],
    followUps: [],
  },
  {
    code: 'QT-012',
    created: 38,
    source: 'WhatsApp',
    product: 'AI Chatbot',
    status: 'lost',
    org: 'Domino\'s Pakistan',
    orgType: 'Restaurant',
    city: 'Lahore',
    headcount: 180,
    existing: 'Global chatbot',
    contact: 'Hannah Brooks',
    phone: '+923334445566',
    designation: 'Marketing Manager',
    summary: 'Ordering bot for WhatsApp.',
    lossReason: 'Chose another system',
    notes: [{ days: 20, channel: 'Email', outcome: 'Closed Lost', note: 'Global team already selected a vendor for all markets.' }],
    followUps: [],
  },
  {
    code: 'QT-013',
    created: 16,
    source: 'Meta Ads',
    product: 'AI Attendance System',
    status: 'connected',
    org: 'Beaconhouse Model School',
    orgType: 'School',
    city: 'Lahore',
    headcount: 820,
    existing: 'Manual registers + Excel',
    contact: 'Maya Chen',
    phone: '+923004561202',
    designation: 'Vice Principal',
    summary: 'Second contact for the same campus group.',
    notes: [{ days: 9, channel: 'WhatsApp', outcome: 'Follow-up required', note: 'Shared campus-wise pricing. Confirmed the same account as QT-001.' }],
    followUps: [{ days: 5 }],
  },
  {
    code: 'QT-014',
    created: 60,
    source: 'Walk-in',
    product: 'HR / Payroll',
    status: 'negotiation',
    org: 'Pakistan Cables',
    orgType: 'Factory',
    city: 'Karachi',
    headcount: 700,
    existing: 'Legacy desktop software',
    contact: 'Felix Lindqvist',
    phone: '+923005551177',
    designation: 'Finance Controller',
    summary: 'Payroll, loans and provident fund for 700 staff.',
    objection: 'Pricing',
    notes: [{ days: 16, channel: 'Call', outcome: 'Negotiation', note: 'Asked for a three-year price lock. Waiting on our revised quote.' }],
    followUps: [{ days: -1, time: '13:00' }],
  },
  {
    code: 'QT-015',
    created: 8,
    source: 'Cold Call',
    product: 'GPS Tracking',
    status: 'contacted',
    org: 'TCS Logistics',
    orgType: 'Office',
    city: 'Lahore',
    headcount: 950,
    existing: 'Existing vendor',
    contact: 'Priya Natarajan',
    phone: '+923116667788',
    designation: 'Operations Head',
    summary: 'Replace trackers on 120 delivery bikes.',
    notes: [{ days: 7, channel: 'Call', outcome: 'No answer', note: 'Gatekeeper asked for an email. No reply yet.' }],
    followUps: [{ days: 0 }],
  },
  {
    code: 'QT-016',
    created: 5,
    source: 'Referral',
    product: 'AI Chatbot',
    status: 'new',
    org: 'Shaukat Khanum Hospital',
    orgType: 'Hospital',
    city: 'Lahore',
    headcount: 1200,
    existing: 'Call centre',
    contact: 'Amara Osei',
    phone: '+923459991100',
    designation: 'Patient Services',
    summary: 'Appointment booking bot for WhatsApp.',
    notes: [],
    followUps: [{ days: 1, time: '10:00' }],
  },
  {
    code: 'QT-017',
    created: 27,
    source: 'Meta Ads (40%)',
    product: 'AI Attendance System',
    status: 'proposal_sent',
    org: 'Punjab Group of Colleges',
    orgType: 'College',
    city: 'Faisalabad',
    headcount: 1500,
    existing: 'Biometric devices',
    contact: 'Charlotte Ng',
    phone: '+923008881199',
    designation: 'IT Manager',
    summary: 'Central attendance dashboard for 6 campuses.',
    objection: 'Integration',
    notes: [{ days: 17, channel: 'Email', outcome: 'Proposal sent', note: 'Sent the API integration scope and the campus rollout plan.' }],
    followUps: [{ days: -4, time: '11:30' }],
  },
  {
    code: 'QT-018',
    created: 9,
    source: 'WhatsApp',
    product: 'HR / Payroll',
    status: 'demo_scheduled',
    org: 'KFC Pakistan',
    orgType: 'Restaurant',
    city: 'Karachi',
    headcount: 640,
    existing: 'Regional spreadsheets',
    contact: 'Eli Thompson',
    phone: '+923217770011',
    designation: 'Area Manager',
    b2b: true,
    summary: 'Payroll for 14 franchise outlets; reseller discussion.',
    details: 'Wants to resell to franchise owners if the pilot works.',
    notes: [{ days: 4, channel: 'WhatsApp', outcome: 'Demo scheduled', note: 'Booked a demo for the franchise operations team.' }],
    followUps: [{ days: 2, time: '16:30' }],
    meetings: [{ days: 0, time: '17:00', type: 'Call', status: 'Scheduled', notes: 'Intro with franchise owners.' }],
  },
]

const templates: { name: string; segment: string; product: string | null; scenario: string; body: string }[] = [
  {
    name: 'First reply after Meta Ads lead',
    segment: 'Intro',
    product: null,
    scenario: 'New lead from a Meta Ads form, same day.',
    body: 'Assalam-o-Alaikum [Name], this is [My Name] from the sales team. You enquired about our [Product] for [Company Name]. Would you like a short call today to understand your requirement?',
  },
  {
    name: 'Follow-up after no answer',
    segment: 'Follow-up',
    product: null,
    scenario: 'Called twice with no answer.',
    body: 'Assalam-o-Alaikum [Name], I tried calling you earlier about [Product] for [Company Name]. Please let me know a good time for a 5-minute call. Thank you.',
  },
  {
    name: 'Demo confirmation',
    segment: 'Demo',
    product: null,
    scenario: 'Demo scheduled with date and time agreed.',
    body: 'Assalam-o-Alaikum [Name], confirming our demo of the [Product] for [Company Name]. I will share the meeting link before the call. Please invite anyone who will use the system.',
  },
  {
    name: 'Proposal follow-up',
    segment: 'Closing',
    product: null,
    scenario: 'Proposal sent, no reply after 3 days.',
    body: 'Assalam-o-Alaikum [Name], did you get a chance to review the proposal for [Company Name]? I can adjust the scope or the number of users if that helps. Happy to walk you through it.',
  },
  {
    name: 'Price objection response',
    segment: 'Pricing',
    product: null,
    scenario: 'Client says the price is high.',
    body: 'Assalam-o-Alaikum [Name], I understand the budget concern. For [Company Name] we can start with a smaller rollout and add users later, so the first payment stays low. Shall I send two options?',
  },
  {
    name: 'Postponed, check back',
    segment: 'Postponed',
    product: null,
    scenario: 'Client asked us to follow up next month.',
    body: 'Assalam-o-Alaikum [Name], just checking in as agreed. No pressure at all. Whenever the timing is right for [Company Name], I can restart the [Product] discussion from where we left it.',
  },
]

export async function seedWorkspace(db: D1Database, owner: string) {
  await clearWorkspace(db, owner)
  const t = Date.now()
  const statements: D1PreparedStatement[] = []

  for (const lead of leads) {
    const leadId = id()
    const createdDate = iso(-lead.created)
    const createdAt = t - lead.created * DAY
    const openFollowUps = lead.followUps ?? []
    const overdue = openFollowUps.some((f) => iso(f.days) < iso(0))
    const lastNoteDays = lead.notes.length ? Math.min(...lead.notes.map((n) => n.days)) : lead.created
    const lastActivity = lead.notes.length ? stamp(-lastNoteDays) : null
    const score = computePriority({
      status: lead.status,
      b2b: lead.b2b,
      headcount: lead.headcount,
      overdueFollowUp: overdue,
      lastActivityAt: lastActivity,
      createdAt,
      now: t,
    })
    const phone = normalizePhone(lead.phone)
    const source = lead.source

    statements.push(
      db
        .prepare(
          `INSERT INTO leads (id, owner_sub, lead_code, created_date, lead_source, product_interest, status, priority_score, assigned_to, b2b, archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .bind(leadId, owner, lead.code, createdDate, source, lead.product, lead.status, score, 'Sales Owner', lead.b2b ? 1 : 0, createdAt, t - lastNoteDays * DAY),
    )
    statements.push(
      db
        .prepare(`INSERT INTO organizations (id, owner_sub, lead_id, organization_name, organization_type, city, headcount, existing_system) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id(), owner, leadId, lead.org, lead.orgType, lead.city, lead.headcount, lead.existing),
    )
    statements.push(
      db
        .prepare(`INSERT INTO lead_contacts (id, owner_sub, lead_id, full_name, phone_number, designation, contact_role, created_at) VALUES (?, ?, ?, ?, ?, ?, 'Primary', ?)`)
        .bind(id(), owner, leadId, lead.contact, phone, lead.designation, createdAt),
    )
    statements.push(
      db
        .prepare(
          `INSERT INTO requirements (id, owner_sub, lead_id, requirement_summary, requirement_details, objection_type, loss_reason, internal_remarks, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id(), owner, leadId, lead.summary, lead.details ?? null, lead.objection ?? null, lead.lossReason ?? null, lead.remarks ?? null, t),
    )

    for (const note of lead.notes) {
      const date = stamp(-note.days, 10 + (note.days % 6))
      statements.push(
        db
          .prepare(`INSERT INTO interactions (id, owner_sub, lead_id, interaction_date, channel, outcome, note, status_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id(), owner, leadId, date, note.channel, note.outcome, note.note, lead.status, t - note.days * DAY),
      )
    }

    for (const followUp of lead.followUps ?? []) {
      statements.push(
        db
          .prepare(`INSERT INTO follow_ups (id, owner_sub, lead_id, due_date, due_time, creation_mode, is_completed, created_at) VALUES (?, ?, ?, ?, ?, 'Manual', 0, ?)`)
          .bind(id(), owner, leadId, iso(followUp.days), followUp.time ?? null, t - lead.created * DAY),
      )
    }

    for (const meeting of lead.meetings ?? []) {
      statements.push(
        db
          .prepare(`INSERT INTO meetings (id, owner_sub, lead_id, scheduled_at, meeting_type, meeting_status, meeting_notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id(), owner, leadId, `${iso(meeting.days)}T${meeting.time}`, meeting.type, meeting.status, meeting.notes ?? null, t - DAY),
      )
    }
  }

  for (const template of templates) {
    statements.push(
      db
        .prepare(`INSERT INTO message_templates (id, owner_sub, template_name, segment, product, usage_scenario, message_body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id(), owner, template.name, template.segment, template.product, template.scenario, template.body, t, t),
    )
  }

  statements.push(db.prepare(`UPDATE workspaces SET seeded_at = ? WHERE owner_sub = ?`).bind(t, owner))
  statements.push(db.prepare(`INSERT OR REPLACE INTO lead_workspace (owner_sub, seeded_at) VALUES (?, ?)`).bind(owner, t))
  for (let i = 0; i < statements.length; i += 40) await db.batch(statements.slice(i, i + 40))
}

export async function clearWorkspace(db: D1Database, owner: string) {
  await db.batch(
    [
      'follow_ups',
      'meetings',
      'interactions',
      'requirements',
      'organizations',
      'lead_contacts',
      'leads',
      'message_templates',
      'activities',
      'tasks',
      'files',
      'deals',
      'contacts',
      'companies',
    ].map((table) => db.prepare(`DELETE FROM ${table} WHERE owner_sub = ?`).bind(owner)),
  )
  await db.prepare(`DELETE FROM lead_workspace WHERE owner_sub = ?`).bind(owner).run()
  await db.prepare(`UPDATE workspaces SET seeded_at = NULL WHERE owner_sub = ?`).bind(owner).run()
}
