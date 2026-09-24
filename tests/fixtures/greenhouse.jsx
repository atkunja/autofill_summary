import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
const option=label=>({label,value:label});
function App(){
 const [values,setValues]=useState({gender:option('Male')});
 const choose=(id,label,options,async=false)=><section><label id={id+'-label'} htmlFor={id}>{label}</label>{React.createElement(async?AsyncSelect:Select,{inputId:id,instanceId:id,classNamePrefix:'select','aria-labelledby':id+'-label',value:values[id]||null,onChange:value=>setValues(old=>({...old,[id]:value})),...(async?{loadOptions:query=>new Promise(resolve=>setTimeout(()=>resolve(options.map(option).filter(o=>o.label.toLowerCase().includes(query.toLowerCase()))),100)),defaultOptions:true}:{options:options.map(option)})})}</section>;
 return <main><h1>Software Engineering Intern</h1><p>Build systems software and reliable connectivity.</p><h2>Apply for this job</h2><form onSubmit={e=>e.preventDefault()}>
 {choose('school','School',['Example University - Main','Example University - East'],true)}
 {choose('degree','Degree',["Bachelor's Degree","Master's Degree"])}
 {choose('major','Discipline',location.search.includes('generic')?['Engineering','Computer Science']:['Computer Engineering','Computer Science'])}
 {choose('end-month','End date month',['May','June'])}
 <label>End date year<input type="number" id="end-year"/></label>
 {choose('graduation','Will you be graduating before September 2027?',['Yes','No'])}
 {choose('internship','Are you looking for a summer internship?',['Yes','No'])}
 {choose('authorization','Are you authorized to work in the US?',['Yes','No'])}
 {choose('sponsor','Will you now or in the future require sponsorship for employment visa status (e.g., H-1B visa)?',['Yes','No'])}
 {choose('gender','Gender',['Male','Female','Decline to self identify'])}
 {choose('race','Please identify your race',['Asian','White','Decline to self identify'])}
 {choose('ethnicity','Are you Hispanic/Latino?',['Yes','No'])}
 {choose('veteran','Veteran Status',['I am not a protected veteran','I identify as a protected veteran'])}
 <fieldset><legend>Are you 18 years of age or older?</legend><label><input type="radio" name="adult" value="yes"/>Yes</label><label><input type="radio" name="adult" value="no"/>No</label></fieldset>
 <label><input type="checkbox" id="consent"/>I accept the terms</label>
 </form><pre id="values">{JSON.stringify(values)}</pre></main>;
}
createRoot(document.getElementById('root')).render(<App/>);
