export const educationFields = {school:'School / university',degree:'Degree level',discipline:'Discipline / major',educationStartMonth:'Education start month',educationStartYear:'Education start year',educationEndMonth:'Graduation month',educationEndYear:'Graduation year'};
export const preferenceFields = {currentlyStudent:'Currently a student',seekingInternship:'Seeking a summer internship',workAuthorizationUS:'Authorized to work in the US',sponsorship:'Need employment visa sponsorship',over18:'Age 18 or older',age:'Age (optional; update as needed)',gender:'Gender',hispanicLatino:'Hispanic / Latino',race:'Race',veteranStatus:'Veteran status'};
export const yesNoFields=['currentlyStudent','seekingInternship','workAuthorizationUS','sponsorship','over18','hispanicLatino'];
export const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
export function inferEducation(text='') {
  const section=text.split(/\bEDUCATION\b/i)[1]?.split(/\b(EXPERIENCE|PROJECTS|SKILLS|EMPLOYMENT)\b/i)[0] || '';
  if(!section)return {};
  const result={};
  const school=section.split('\n').map(s=>s.trim()).find(s=>/\b(university|college|institute of technology)\b/i.test(s));
  if(school) result.school=school.replace(/\s{2,}.*$/,'').replace(/,\s*[A-Z]{2}\b.*$/,'').trim();
  if(/bachelor|\bB\.?S\.?E?\b/i.test(section))result.degree="Bachelor's Degree";
  else if(/master|\bM\.?S\.?\b/i.test(section))result.degree="Master's Degree";
  else if(/doctor|ph\.?d/i.test(section))result.degree='Doctorate';
  const major=section.match(/\b(Computer Engineering|Computer Science|Electrical Engineering|Mechanical Engineering|Software Engineering|Data Science|Information Systems|Mathematics|Physics)\b/i);
  if(major)result.discipline=major[0];
  const dates=[...section.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/gi)];
  if(dates.length){const date=dates.at(-1);result.educationEndMonth=date[1];result.educationEndYear=date[2];}
  if(dates.length===2){result.educationStartMonth=dates[0][1];result.educationStartYear=dates[0][2];}
  return result;
}
