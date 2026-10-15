export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') el.className = value;
    else if (key === 'value') el.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected') el[key] = Boolean(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  children.flat(Infinity).forEach(child => {
    if (child != null && child !== false) el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return el;
}
export function button(label, action, type = '', attrs = {}) { return h('button', { type: 'button', class: `button ${type}`, onclick: action, ...attrs }, label); }
export function field(label, name, value = '', options = {}) {
  const { area, choices, ...attrs } = options;
  attrs['aria-label'] = label;
  let control;
  if (choices) control = h('select', { name, ...attrs }, choices.map(choice => { const item = typeof choice === 'string' ? { value: choice, label: choice } : choice; return h('option', { value: item.value, selected: item.value === value }, item.label); }));
  else if (area) control = h('textarea', { name, rows: 3, ...attrs }, value);
  else control = h('input', { name, value, ...attrs });
  return h('label', { class: `field ${area ? 'wide' : ''}` }, h('span', {}, label), control);
}
export function panel(title, ...content) { return h('section', { class: 'panel' }, title ? h('h3', {}, title) : null, ...content); }
export function note(text, type = '') { return h('p', { class: `note ${type}` }, text); }
export function money(value, currency = 'USD') { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value) || 0); }
export function total(lines = []) { return lines.reduce((sum, l) => sum + Math.round(Number(l.quantity) * Math.round(Number(l.rate) * 100)), 0) / 100; }
export function getForm(form) { return Object.fromEntries(new FormData(form)); }
export function webLink(url, label) {
  try { if (!['http:', 'https:'].includes(new URL(url).protocol)) return null; } catch { return null; }
  return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label);
}
export function download(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = h('a', { href: url, download: name }); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function calendarDate(v) { return v ? new Date(`${v}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'; }
