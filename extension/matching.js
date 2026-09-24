import {educationFields,preferenceFields,inferEducation,monthNames} from './profile-schema.js';
export const profileFields = {
  firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone',
  address: 'Street address', address2: 'Address line 2', city: 'City', state: 'State / province',
  postalCode: 'Postal code', country: 'Country', linkedin: 'LinkedIn URL', github: 'GitHub URL', website: 'Portfolio URL'
};
export const allProfileFields={...profileFields,...educationFields,...preferenceFields};
const rules = [
  ['firstName', /\b(first|given) name\b/], ['lastName', /\b(last|family|sur) ?name\b/],
  ['fullName', /^(full legal |full |legal |your )?name$/], ['email', /\be ?mail\b/],
  ['phone', /\b(phone|mobile|telephone)\b/], ['address2', /\b(address.*(2|two)|apartment|suite)\b/],
  ['address', /\b(street address|address line 1|address1|mailing address)\b|^address$/],
  ['city', /\b(city|town)\b/], ['state', /^(state|province|state province|state or province)$/],
  ['postalCode', /\b(zip|postal)\b/], ['country', /^country( of residence)?$/],
  ['github', /git ?hub/], ['linkedin', /linked ?in/], ['website', /\b(portfolio|website|personal site)\b/]
];
const autocomplete = {'given-name':'firstName','family-name':'lastName',name:'fullName',email:'email',tel:'phone','street-address':'address','address-line1':'address','address-line2':'address2','address-level2':'city','address-level1':'state','postal-code':'postalCode','country-name':'country',country:'country',url:'website'};
export function normalize(s = '') { return s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
export function isSensitive(label) {
  return /\b(hispanic|latino|gender|sex|sexual|orientation|pronouns|race|ethnic|ethnicity|nationality|disability|disabled|veteran|citizen|citizenship|visa|sponsor|sponsorship|authorized|authorization|criminal|convict|salary|compensation|ssn|social security|birth|age|religion|consent|agree|password|eligible to work|right to work)\b/i.test(label);
}
export function savedFieldKey(field) {
  const l=normalize(field.label);
  if (/^(school|university|college)( name)?$/.test(l)) return 'school';
  if (/^(still student|currently enrolled|are you currently a student)$/.test(l))return 'currentlyStudent';
  if (/^(degree|degree level|degree type|highest degree)$/.test(l)) return 'degree';
  if (/^(discipline|major|field of study|primary major)$/.test(l)) return 'discipline';
  if (/^(education )?start date month$|^start month$/.test(l)) return 'educationStartMonth';
  if (/^(education )?start date year$|^start year$/.test(l)) return 'educationStartYear';
  if (/^(education )?end date month$|^(graduation|expected graduation) month$/.test(l)) return 'educationEndMonth';
  if (/^(education )?end date year$|^(graduation|expected graduation) year$/.test(l)) return 'educationEndYear';
  if (/^(are you )?(looking for|seeking|interested in) (a )?(summer )?internship$/.test(l))return 'seekingInternship';
  if (/^are you (legally )?(authorized|eligible) to work in (the )?(us|u s|united states)$/.test(l))return 'workAuthorizationUS';
  if (/^requesting visa sponsorship$|^will you .*require sponsorship|^do you (now or in the future )?(need|require) .*sponsorship|^visa sponsorship$/.test(l))return 'sponsorship';
  if (/^(are you )?(at least |age )?18 (years (of age |old )?)?(or older|or over)$|^are you over 18$/.test(l))return 'over18';
  if (/^(age|your age)$/.test(l))return 'age';
  if (/^(gender|what is your gender|gender identity|sex)$/.test(l))return 'gender';
  if (/^(are you )?(hispanic latino|hispanic or latino|hispanic|latino)$/.test(l))return 'hispanicLatino';
  if (/^(please identify your race|race|race ethnicity|what is your race)$/.test(l))return 'race';
  if (/^(veteran status|protected veteran status)$/.test(l))return 'veteranStatus';
  if (/^will you be graduat(ing|ed) (before|by) [a-z]+ (20\d{2})$/.test(l))return 'graduationCutoff';
  return null;
}
export function classify(field) {
  const label = normalize(field.label);
  const saved=savedFieldKey(field);
  if(saved)return saved;
  if (isSensitive(label)) return null;
  if (field.type === 'file') return /\b(resume|cv|curriculum vitae)\b/.test(label) ? 'resume' : null;
  if (/git ?hub/.test(label)) return 'github';
  if (/linked ?in/.test(label)) return 'linkedin';
  const ac = field.autocomplete?.split(' ').at(-1);
  if (autocomplete[ac]) return autocomplete[ac];
  for (const [key, re] of rules) if (re.test(label)) return key;
  return null;
}
export function equivalent(a,b,key) {
  const clean=value=>normalize(String(value)).replace(/\s+degree$/,'');
  let left=clean(a),right=clean(b);
  if(left===right)return true;
  if(key==='degree') {
    const degree=value=>/^(bachelor|bachelors|bachelor s|b s|bs|bse|b s e|bachelor of science|bachelor of science in engineering)$/.test(value)?'bachelor':/^(master|masters|master s|m s|ms|master of science)$/.test(value)?'master':value;
    return degree(left)===degree(right);
  }
  if(/Month$/.test(key || '')) {
    const month=value=>{const i=monthNames.findIndex(m=>normalize(m)===value||normalize(m).slice(0,3)===value);return i>=0?i+1:Number(value);};
    return month(left)>=1&&month(left)<=12&&month(left)===month(right);
  }
  return false;
}
export function fallbackValues(key,value,profile={}) {
  if(key==='school' && normalize(value)==='university of michigan ann arbor')return ['University of Michigan'];
  if(key==='discipline' && /engineering$/i.test(value) && normalize(value)!=='engineering')return ['Engineering'];
  if(key==='race' && profile.hispanicLatino==='No' && normalize(value)==='asian')return ['Asian (Not Hispanic or Latino)'];
  return [];
}
export function suggestion(field, profile) {
  const key=classify(field);
  if(!key || key==='resume')return '';
  const education=inferEducation(profile.background);
  let value=key==='fullName'?[profile.firstName,profile.lastName].filter(Boolean).join(' '):profile[key] || education[key] || '';
  if(key==='graduationCutoff') {
    const match=normalize(field.label).match(/(before|by) ([a-z]+) (20\d{2})$/);
    const month=monthNames.findIndex(m=>normalize(m)===normalize(profile.educationEndMonth || education.educationEndMonth || ''));
    const cutoff=monthNames.findIndex(m=>normalize(m)===match?.[2]);
    const year=Number(profile.educationEndYear || education.educationEndYear);
    if(!match || month<0 || cutoff<0 || !year)return '';
    const actual=year*12+month, target=Number(match[3])*12+cutoff;
    // A month alone cannot resolve a strict-before question in the same month.
    if(actual===target && match[1]==='before')return '';
    value=(match[1]==='by'?actual<=target:actual<target)?'Yes':'No';
  }
  if(!value)return '';
  if(field.options){for(const candidate of [value,...fallbackValues(key,value,profile)]){const matches=field.options.filter(o=>o.value && !o.disabled && [o.value,o.label].some(s=>equivalent(s,candidate,key)));if(matches.length===1)return matches[0].value;if(matches.length>1)return '';}return '';}
  return value;
}
export function canDraft(field) {
  return !classify(field) && !isSensitive(field.label) && field.type !== 'file' && !field.options &&
    (field.tag === 'textarea' || /\b(why|describe|looking for|tell us|motivation|interest|experience|strength|cover letter|share something.*built)\b/i.test(field.label));
}
