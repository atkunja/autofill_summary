export const profileFields = {
  firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone',
  address: 'Street address', address2: 'Address line 2', city: 'City', state: 'State / province',
  postalCode: 'Postal code', country: 'Country', linkedin: 'LinkedIn URL', github: 'GitHub URL', website: 'Portfolio URL'
};
const rules = [
  ['firstName', /\b(first|given) name\b/], ['lastName', /\b(last|family|sur) ?name\b/],
  ['fullName', /^(full |legal |your )?name$/], ['email', /\be ?mail\b/],
  ['phone', /\b(phone|mobile|telephone)\b/], ['address2', /\b(address.*(2|two)|apartment|suite)\b/],
  ['address', /\b(street address|address line 1|address1|mailing address)\b|^address$/],
  ['city', /\b(city|town)\b/], ['state', /^(state|province|state province|state or province)$/],
  ['postalCode', /\b(zip|postal)\b/], ['country', /^country( of residence)?$/],
  ['github', /git ?hub/], ['linkedin', /linked ?in/], ['website', /\b(portfolio|website|personal site)\b/]
];
const autocomplete = {'given-name':'firstName','family-name':'lastName',name:'fullName',email:'email',tel:'phone','street-address':'address','address-line1':'address','address-line2':'address2','address-level2':'city','address-level1':'state','postal-code':'postalCode','country-name':'country',country:'country',url:'website'};
export function normalize(s = '') { return s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
export function isSensitive(label) {
  return /\b(gender|sex|sexual|orientation|pronouns|race|ethnic|ethnicity|nationality|disability|disabled|veteran|citizen|citizenship|visa|sponsor|sponsorship|authorized|authorization|criminal|convict|salary|compensation|ssn|social security|birth|age|religion|consent|agree|password|eligible to work|right to work)\b/i.test(label);
}
export function classify(field) {
  const label = normalize(field.label);
  if (isSensitive(label)) return null;
  if (field.type === 'file') return /\b(resume|cv|curriculum vitae)\b/.test(label) ? 'resume' : null;
  if (/git ?hub/.test(label)) return 'github';
  if (/linked ?in/.test(label)) return 'linkedin';
  const ac = field.autocomplete?.split(' ').at(-1);
  if (autocomplete[ac]) return autocomplete[ac];
  for (const [key, re] of rules) if (re.test(label)) return key;
  return null;
}
export function suggestion(field, profile) {
  const key = classify(field);
  if (!key || key === 'resume') return '';
  const value = key === 'fullName' ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') : profile[key] || '';
  if (field.options) return field.options.find(o => o.value && !o.disabled && [o.value, o.label].some(s => normalize(s) === normalize(value)))?.value || '';
  return value;
}
export function canDraft(field) {
  return !classify(field) && !isSensitive(field.label) && field.type !== 'file' && !field.options &&
    (field.tag === 'textarea' || /\b(why|describe|looking for|tell us|motivation|interest|experience|strength|cover letter)\b/i.test(field.label));
}
