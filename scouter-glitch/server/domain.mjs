import { randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message); this.status = status; this.code = code;
  }
}

export const SERVICES = [
  { id: 'website', name: 'Websites & inquiry pages', lane: 'Digital fixes', icon: '◎', offer: 'A small service website with an inquiry page', queries: ['painters', 'landscapers', 'cleaning services', 'auto repair'] },
  { id: 'booking', name: 'Booking & intake setup', lane: 'Digital fixes', icon: '▦', offer: 'A booking or intake workflow setup', queries: ['barbers', 'salons', 'personal trainers', 'pet groomers'] },
  { id: 'tech', name: 'Computer & software help', lane: 'Digital fixes', icon: '⌘', offer: 'A focused computer or software setup session', queries: ['small businesses', 'property managers'] },
  { id: 'admin', name: 'Spreadsheet & admin help', lane: 'Digital fixes', icon: '▤', offer: 'A spreadsheet cleanup or administrative support session', queries: ['property management', 'contractors'] },
  { id: 'photos', name: 'Photos & product shoots', lane: 'Creative gigs', icon: '◉', offer: 'A small photo shoot with agreed deliverables', queries: ['restaurants', 'cafes', 'property management', 'local shops'] },
  { id: 'video', name: 'Promotional videos', lane: 'Creative gigs', icon: '▶', offer: 'A short promotional video', queries: ['gyms', 'restaurants', 'landscapers', 'event venues'] },
  { id: 'editing', name: 'Editing, clips & captions', lane: 'Creative gigs', icon: '✂', offer: 'Editing or repurposing existing footage into agreed clips', queries: ['podcast', 'cooking', 'fitness', 'gaming'] },
  { id: 'design', name: 'Thumbnails, menus & graphics', lane: 'Creative gigs', icon: '◇', offer: 'A focused graphic design package', queries: ['restaurants', 'cafes', 'podcast', 'gaming'] },
  { id: 'cleaning', name: 'Cleaning & rental turnovers', lane: 'Hands-on jobs', icon: '✧', offer: 'A cleanup with agreed rooms, supplies, and timing', queries: ['property management', 'event venues'] },
  { id: 'assembly', name: 'Furniture assembly', lane: 'Hands-on jobs', icon: '⊞', offer: 'Furniture assembly with agreed items and access', queries: ['property management', 'furniture stores'] },
  { id: 'organizing', name: 'Organizing & packing help', lane: 'Hands-on jobs', icon: '▣', offer: 'An organizing or packing session', queries: ['property management', 'moving companies'] },
  { id: 'events', name: 'Event setup & support', lane: 'Hands-on jobs', icon: '⚑', offer: 'Event setup or cleanup support', queries: ['event venues', 'wedding venues', 'caterers'] }
];
export const STAGES = ['New', 'Qualified', 'Contacted', 'Quoted', 'Booked', 'Delivered', 'Paid', 'Lost'];
export const SOURCES = ['manual', 'request', 'google', 'youtube'];
export const DEFAULT_PROFILE = { name: '', businessName: '', location: 'Rexburg, Idaho', currency: 'USD', services: [], equipment: '', transport: '', availability: '', hourlyRate: 0, proof: '' };

export function text(value, max = 2000) {
  if (value == null) return '';
  if (typeof value !== 'string') throw new AppError('Expected text.');
  if (value.length > max) throw new AppError(`Text exceeds ${max} characters.`);
  return value.trim();
}
export function finite(value, min = 0, max = 1e7) {
  if (value != null && !['string', 'number'].includes(typeof value)) throw new AppError('Enter a valid number.');
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < min || n > max) throw new AppError(`Enter a number between ${min} and ${max}.`);
  return n;
}
export function safeUrl(value, { publicOnly = false } = {}) {
  const input = text(value, 2000);
  if (!input) return '';
  let u;
  try { u = new URL(input); } catch { throw new AppError('Use a complete http:// or https:// URL.'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new AppError('Only web links without embedded credentials are supported.');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (publicOnly && (host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') || /^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.|^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.includes(':'))) throw new AppError('Use a public website for an audit.');
  return u.href;
}
export function service(id) {
  const found = SERVICES.find(s => s.id === id);
  if (!found) throw new AppError('Choose a supported service.');
  return found;
}
function date(value) {
  const v = text(value, 10);
  if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)) throw new AppError('Use a valid date.');
  return v;
}
export function quoteTotal(lines) {
  return lines.reduce((total, item) => total + Math.round(item.quantity * Math.round(item.rate * 100)), 0) / 100;
}
export function validateOpportunity(input, existing) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Opportunity details are required.');
  const source = existing?.source || input.source || 'manual';
  if (!SOURCES.includes(source)) throw new AppError('Unknown opportunity source.');
  const provider = ['google', 'youtube'].includes(source);
  const serviceId = input.serviceId || existing?.serviceId || 'website';
  service(serviceId);
  const externalId = text(existing?.externalId || input.externalId, 200);
  if (provider && (!externalId || !/^[a-zA-Z0-9_-]+$/.test(externalId))) throw new AppError('A valid provider identifier is required.');
  const stage = input.stage || 'New';
  if (!STAGES.includes(stage)) throw new AppError('Unknown pipeline stage.');
  const title = provider ? '' : text(input.title, 180);
  if (!provider && !title) throw new AppError('Give the opportunity a title.');
  const quote = input.quote || { lines: [], terms: '', validUntil: '' };
  if (!Array.isArray(quote.lines) || quote.lines.length > 30) throw new AppError('A quote can have up to 30 items.');
  if (quote.lines.some(item => !item || typeof item !== 'object')) throw new AppError('Invalid quote item.');
  const lines = quote.lines.map(item => ({ description: text(item.description, 300), quantity: finite(item.quantity, 0.01, 1000), rate: finite(item.rate, 0, 1e6) }));
  if (lines.some(l => !l.description)) throw new AppError('Describe each quote item.');
  if (quoteTotal(lines) > 1e7) throw new AppError('Quote total is too large.');
  const payment = Math.round(finite(input.payment) * 100) / 100;
  if (stage === 'Paid' && payment <= 0) throw new AppError('Record the payment received before marking a job Paid.');
  if (!Array.isArray(input.expenses || []) || (input.expenses || []).length > 100) throw new AppError('Too many expense items.');
  if (!Array.isArray(input.activities || []) || (input.activities || []).length > 300) throw new AppError('Too many activity entries.');
  if ((input.expenses || []).some(e => !e || typeof e !== 'object') || (input.activities || []).some(a => !a || typeof a !== 'object')) throw new AppError('Invalid expense or activity entry.');
  const now = new Date().toISOString();
  return {
    id: existing?.id || randomUUID(), source, externalId, title, serviceId, stage,
    // Provider names, addresses, reviews, and statistics remain transient. Only IDs
    // and the user's own workflow records are written to the database.
    description: provider ? '' : text(input.description, 5000),
    location: provider ? '' : text(input.location, 200),
    sourceUrl: provider ? '' : safeUrl(input.sourceUrl),
    contact: provider ? '' : text(input.contact, 500),
    website: provider ? '' : safeUrl(input.website),
    budget: finite(input.budget),
    offer: text(input.offer, 1500), notes: text(input.notes, 10000),
    nextAction: text(input.nextAction, 500), followUp: date(input.followUp),
    quote: { lines, terms: text(quote.terms, 3000), validUntil: date(quote.validUntil) },
    payment, hours: finite(input.hours, 0, 10000),
    expenses: (input.expenses || []).map(e => ({ description: text(e.description, 300), amount: Math.round(finite(e.amount) * 100) / 100 })),
    episode: { title: text(input.episode?.title, 200), consent: ['Not asked', 'Granted', 'Declined'].includes(input.episode?.consent) ? input.episode.consent : 'Not asked', before: text(input.episode?.before, 4000), after: text(input.episode?.after, 4000), lesson: text(input.episode?.lesson, 4000), mediaUrl: safeUrl(input.episode?.mediaUrl), status: ['Idea', 'Filming', 'Editing', 'Published'].includes(input.episode?.status) ? input.episode.status : 'Idea' },
    activities: (input.activities || []).map(a => ({ date: date(a.date), text: text(a.text, 1000) })),
    createdAt: existing?.createdAt || now, updatedAt: now
  };
}
export function validateProfile(input) {
  if (!input || typeof input !== 'object') throw new AppError('Profile is required.');
  const currency = input.currency || 'USD';
  if (!['USD', 'CAD', 'GBP', 'EUR', 'AUD'].includes(currency)) throw new AppError('Choose a supported currency.');
  if (!Array.isArray(input.services || [])) throw new AppError('Choose services from the list.');
  const services = [...new Set(input.services || [])];
  services.forEach(service);
  return { name: text(input.name, 120), businessName: text(input.businessName, 150), location: text(input.location, 200), currency, services, equipment: text(input.equipment, 1000), transport: text(input.transport, 500), availability: text(input.availability, 500), hourlyRate: finite(input.hourlyRate, 0, 10000), proof: text(input.proof, 2000) };
}
export function intelligence(target, serviceId) {
  const chosen = service(serviceId);
  if (target.source === 'google' && target.businessStatus === 'CLOSED_PERMANENTLY') return { serviceId, score: null, reasons: [], summary: 'Marked permanently closed. Verify status before approaching.', offer: chosen.offer, unknowns: ['Current business status', 'Interest and budget'] };
  if (serviceId === 'website' && target.source === 'google' && target.detailsLoaded) {
    const rating = target.rating == null ? NaN : Number(target.rating), reviews = target.reviewCount == null ? NaN : Number(target.reviewCount);
    const reasons = [
      { label: target.website ? 'Website listed; quality not assessed' : 'Website not listed on Google', points: target.website ? 0 : 50 },
      { label: Number.isFinite(rating) ? `Customer rating: ${rating}` : 'Customer rating unknown', points: !Number.isFinite(rating) ? 0 : rating >= 4.5 ? 20 : rating >= 4 ? 15 : rating >= 3.5 ? 5 : 0 },
      { label: Number.isFinite(reviews) ? `${reviews} reviews` : 'Review count unknown', points: !Number.isFinite(reviews) ? 0 : reviews >= 100 ? 20 : reviews >= 50 ? 15 : reviews >= 10 ? 10 : reviews > 0 ? 5 : 0 },
      { label: target.phone ? 'Phone available' : 'Phone not listed', points: target.phone ? 10 : 0 }
    ];
    return { serviceId, score: reasons.reduce((n, r) => n + r.points, 0), reasons, summary: 'An initial website-service priority score, not purchase likelihood.', offer: chosen.offer, unknowns: ['Whether a website exists elsewhere', 'Owner interest and budget', 'Actual business priorities'] };
  }
  return { serviceId, score: null, reasons: [], summary: target.source === 'request' ? 'A user-supplied request. Scope and payment still need confirmation.' : 'A potential client. A need for this service has not been confirmed.', offer: chosen.offer, unknowns: ['Specific scope and deadline', 'Interest and budget', 'Your availability and fit'] };
}
export function templateDraft({ title, offer, notes, channel, source, profile }) {
  const name = text(title, 200) || 'there';
  const proposal = text(offer, 1500) || 'a small project';
  const hello = profile.name ? `I'm ${profile.name}${profile.businessName ? ` from ${profile.businessName}` : ''}. ` : '';
  const opening = source === 'request' ? `${hello}I saw your request about ${name}. Could you share the scope, deadline, and budget?` : `${hello}I came across ${name} and wanted to ask whether ${proposal.toLowerCase()} is something you are considering.`;
  if (channel === 'Phone') return `Hi, ${opening} Is now a good time for a quick question?\n\nAsk what they need, confirm timing, and agree on the next step.`;
  const body = `${opening}\n\nIf it is useful, I can share a clear scope and quote after learning what you need. ${profile.proof ? `Relevant experience: ${profile.proof}` : ''}`.trim();
  return channel === 'Email' ? `Subject: A quick question about ${proposal.toLowerCase()}\n\nHi,\n\n${body}\n\n${profile.name || 'Your name'}` : body;
}
export function moneySummary(items) {
  const revenue = items.reduce((n, o) => n + Math.round(o.payment * 100), 0);
  const expenses = items.reduce((n, o) => n + o.expenses.reduce((s, e) => s + Math.round(e.amount * 100), 0), 0);
  const hours = items.reduce((n, o) => n + o.hours, 0);
  return { revenue: revenue / 100, expenses: expenses / 100, net: (revenue - expenses) / 100, hours, hourly: hours ? (revenue - expenses) / 100 / hours : null };
}
