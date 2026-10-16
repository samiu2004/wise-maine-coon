
// BEGIN FIT LOGIC
const CM_PER_INCH = 2.54;
function convert(value, from, to) {
  if (from === to) return value;
  return from === 'in' ? value * CM_PER_INCH : value / CM_PER_INCH;
}
function assess(cat, length, width) {
  const valid = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
  if (!valid(cat)) return { error: 'Enter a positive cat length.' };
  if (length !== null && !valid(length)) return { error: 'Enter a positive box length, or leave it blank.' };
  if (width !== null && !valid(width)) return { error: 'Enter a positive box width, or leave it blank.' };
  const reference = cat * 1.5;
  if (!Number.isFinite(reference)) return { error: 'This measurement is too large to calculate. Check the value.' };
  const gap = length === null ? null : length - reference;
  return { reference, gap, width, status: gap === null ? 'unknown' : gap >= -1e-9 ? 'meets' : 'below' };
}
// END FIT LOGIC
document.getElementById('script-status').textContent='Worksheet ready. Enter measurements, then select Compare measurements.';
const form=document.querySelector('#fit-form'), unit=document.querySelector('#unit'), result=document.querySelector('#result');
const fields=['cat','length','width'].map(id=>document.getElementById(id));
let previousUnit='in', hasResult=false;
const number=v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v);
const read=input=>input.validity.badInput?NaN:input.value.trim()===''?null:Number(input.value);
const empty=()=>{hasResult=false;result.innerHTML='<p>Add your cat’s length to see the reference size.</p><p class="help">No box measurements yet? You can still calculate the length to look for.</p>';};
function lengthGraphic(cat, length, reference, u) {
 const largest=Math.max(reference, length || 0), scale=300/largest;
 const row=(y,value,label,color)=>`<text x="14" y="${y}" font-size="14" fill="#173b32">${label}: ${number(value)} ${u}</text><rect x="14" y="${y+9}" width="${Math.max(1,value*scale)}" height="16" rx="4" fill="${color}"/>`;
 return `<svg viewBox="0 0 340 ${length===null?145:205}" role="img" aria-label="Length comparison. Bars use the same scale. Cat ${number(cat)} ${u}, reference ${number(reference)} ${u}${length===null?'':`, box ${number(length)} ${u}`}.">${row(24,cat,'Your cat','#879b8b')}${row(82,reference,'Length reference','#285a47')}${length===null?'':row(140,length,'Inside box length',length+1e-9>=reference?'#35795c':'#b07b2f')}</svg><p class="visual-key">Bars share the same length scale. This is not a floor plan or a turning-space test.</p>`;
}
function render(){
 const [cat,length,width]=fields.map(read), data=assess(cat,length,width), u=unit.value;
 fields.forEach(f=>f.removeAttribute('aria-invalid'));
 if(data.error){result.innerHTML='<p class="error"></p>';result.firstChild.textContent=data.error;const bad=fields.find(f=>!f.checkValidity() || (f.value!=='' && !(Number(f.value)>0))) || fields[0];bad.setAttribute('aria-invalid','true');return;}
 hasResult=true;
 const status=data.status==='unknown'?'Box length not compared':data.status==='meets'?'Meets the length reference':'Below the length reference';
 const comparison=data.gap===null?'Add a usable inside length to compare a box.':data.status==='meets'?`The inside length is ${number(Math.max(0,data.gap))} ${u} above the reference. Still check turning room and access.`:`The inside length is ${number(-data.gap)} ${u} below the reference. Look for more usable length.`;
 result.innerHTML=`<p class="eyebrow">Length reference for your cat</p><p class="big">${number(data.reference)} ${u}</p><p class="help">${number(cat)} ${u} × 1.5</p><p class="status signal ${data.status}">${status}</p>${lengthGraphic(cat,length,data.reference,u)}<p>${comparison}</p><h3>Width needs a separate check</h3><p>${width===null?'Inside width not supplied.':`You entered ${number(width)} ${u} of inside width.`} Check space to turn and dig. Width is not scored.</p>`;
}
form.addEventListener('submit',e=>{e.preventDefault();render();});
fields.forEach(f=>f.addEventListener('input',()=>{if(hasResult){hasResult=false;result.innerHTML='<p>Measurements changed. Select <strong>Compare measurements</strong> to update your result.</p>';}}));
unit.addEventListener('change',()=>{fields.forEach(f=>{if(f.value!==''&&Number.isFinite(Number(f.value)))f.value=String(Number(convert(Number(f.value),previousUnit,unit.value).toPrecision(12)));});previousUnit=unit.value;document.querySelectorAll('.unit').forEach(el=>el.textContent=`(${unit.value})`);if(hasResult)render();});
document.querySelector('#example').addEventListener('click',()=>{[18,26,18].forEach((v,i)=>fields[i].value=String(convert(v,'in',unit.value)));render();});
form.addEventListener('reset',()=>{setTimeout(()=>{previousUnit='in';document.querySelectorAll('.unit').forEach(el=>el.textContent='(in)');fields.forEach(f=>f.removeAttribute('aria-invalid'));empty();},0);});
