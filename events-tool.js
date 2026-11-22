
export function createEvents(ctx) {
 const {db,collection,doc,getDocs,addDoc,updateDoc,deleteDoc,query,where,serverTimestamp,esc,shell,schools,schoolIds,canManage,toast,resizeImage}=ctx;
 let items=[],selected=null,mode="grid",campus="all",term="",editing=false,importRows=[],activeSection=null,entryEditor=null,entryDetail=null;
 const root=()=>document.getElementById("vv-events-root");
 const schoolName=id=>schools().find(s=>s.id===id)?.name||"Campus";
 const available=()=>schools().filter(s=>schoolIds().includes(s.id));
 const options=(selectedId="")=>available().map(s=>`<option value="${esc(s.id)}" ${selectedId===s.id?"selected":""}>${esc(s.name)}</option>`).join("");
 const byDate=arr=>[...arr].sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")));
 function dateLabel(d){if(!d)return"Date to be determined";const date=new Date(d+"T12:00:00");return Number.isNaN(date.getTime())?d:date.toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"});}
 function escapeText(x){return esc(String(x??""));}
 function imageSrc(e){const raw=e.imageData||"";return /^data:image\/(png|jpeg|webp);base64,/.test(raw)?raw:"";}
 function art(e,cls){return imageSrc(e)?`<img class="${cls}" src="${esc(imageSrc(e))}" alt="">`:`<div class="${cls} vv-event-no-image" aria-hidden="true">📅</div>`;}
 function section(label,text,placeholder){return `<section class="vv-event-detail-section"><h3>${label}</h3>${text?`<div class="vv-event-preline">${escapeText(text)}</div>`:`<p class="helper">${placeholder}</p>`}</section>`;}
 function tiles(){
  const filtered=byDate(items);
  return `<div class="vv-event-tile-grid">${filtered.map(e=>`<button type="button" class="vv-event-tile" data-vv-event-open="${esc(e.id)}"><div class="vv-event-tile-art">${art(e,"vv-event-art-image")}</div><strong>${escapeText(e.title)}</strong><small>${escapeText(schoolName(e.schoolId))}</small><small>${escapeText(dateLabel(e.date))}</small><span class="vv-event-tile-foot">Open event <span aria-hidden="true">›</span></span></button>`).join("")||'<div class="empty">No events yet. Add your first event or import a CSV.</div>'}</div>`;
 }
 function entries(e,key){
  const records=Array.isArray(e[key])?e[key]:[];
  if(key==="vendorEntries"&&records.length===0&&e.vendors?.trim())return [{id:"legacy",name:"Previous vendor notes",description:e.vendors,contact:""}];
  if(key==="noteEntries"&&records.length===0&&e.notes?.trim())return [{id:"legacy",title:"Previous planning notes",body:e.notes}];
  if(key==="lessonEntries"&&records.length===0&&e.lessons?.trim())return [{id:"legacy",title:"Previous lessons",body:e.lessons}];
  return records;
 }
 function recordsSection(e,key,title,empty){
  const records=entries(e,key);
  return `<section class="card vv-event-section-card"><div class="vv-event-section-head"><h3>${title}</h3><button type="button" class="secondary small" data-vv-event-add-entry="${key}">+ Add New</button></div><div class="vv-event-records">${records.map((r,i)=>`<button type="button" class="vv-event-record" data-vv-event-entry="${key}:${i}"><span><strong>${escapeText(r.name||r.title||"Untitled")}</strong><small>${escapeText(r.description||r.body||"")}</small></span><span aria-hidden="true">›</span></button>`).join("")||`<p class="helper">${empty}</p>`}</div></section>`;
 }
 function dashboard(){
  const e=items.find(x=>x.id===selected);
  if(!e){selected=null;return overview();}
  return `<div class="vv-event-breadcrumb"><button type="button" class="secondary small" data-vv-event-back>← All events</button><span>›</span><span>${escapeText(e.title)}</span></div>
  <div class="vv-event-hero card">${art(e,"vv-event-detail-image")}<div><p class="eyebrow">${escapeText(schoolName(e.schoolId))} · ${escapeText(dateLabel(e.date))}</p><h1>${escapeText(e.title)}</h1><p>${escapeText(e.description||"Event planning and year-over-year reference")}</p></div><div class="vv-event-hero-actions"><label class="vv-event-upload">Change event image<input type="file" accept="image/*" data-vv-event-image="${esc(e.id)}"></label><button type="button" data-vv-event-edit>Edit name & date</button></div></div>
  <div class="vv-event-stats"><div class="card"><span>Date</span><strong>${escapeText(dateLabel(e.date))}</strong></div><div class="card"><span>Time</span><strong>${escapeText(e.time||"Not set")}</strong></div><div class="card"><span>Campus</span><strong>${escapeText(schoolName(e.schoolId))}</strong></div><div class="card"><span>Year</span><strong>${escapeText(e.year||e.date?.slice(0,4)||"Not set")}</strong></div></div>
  <div class="vv-event-info-grid">
   <section class="card vv-event-section-card"><div class="vv-event-section-head"><h3>Preparation checklist</h3><button type="button" class="secondary small" data-vv-event-add-task>+ Add New</button></div>${renderChecklist(e)}</section>
   ${recordsSection(e,"vendorEntries","Vendors","No vendors added yet.")}
   ${recordsSection(e,"noteEntries","Planning notes","No planning notes yet.")}
   ${recordsSection(e,"lessonEntries","Lessons learned","No lessons added yet.")}
   <section class="card vv-event-section-card"><div class="vv-event-section-head"><h3>Overview</h3><button type="button" class="secondary small" data-vv-event-section="description">Edit</button></div><div class="vv-event-preline">${escapeText(e.description||"")||'<span class="helper">Add an event overview.</span>'}</div></section>
   <section class="card vv-event-section-card"><div class="vv-event-section-head"><h3>Time & frequency</h3><button type="button" class="secondary small" data-vv-event-section="time">Edit time</button><button type="button" class="secondary small" data-vv-event-section="recurrence">Edit frequency</button></div><p>${escapeText(e.time||"Time not set")} · ${escapeText(e.recurrence||"Frequency not set")}</p></section>
  </div>
  <div class="card"><div class="section-head compact"><div><h2>Event history</h2><p class="helper">Related records with the same event name.</p></div></div><div class="vv-event-history">${byDate(items.filter(x=>x.id!==e.id&&x.title.trim().toLowerCase()===e.title.trim().toLowerCase())).map(x=>`<button type="button" class="vv-event-history-item" data-vv-event-open="${esc(x.id)}"><strong>${escapeText(x.year||x.date?.slice(0,4)||"Past event")}</strong><span>${escapeText(schoolName(x.schoolId))} · ${escapeText(dateLabel(x.date))}</span><span>Open ›</span></button>`).join("")||'<p class="helper">No other years recorded yet.</p>'}</div></div>`;
 }
 function entryForm(){
  const event=items.find(x=>x.id===selected),key=entryEditor?.key,idx=entryEditor?.index;
  if(!event||!["vendorEntries","noteEntries","lessonEntries","checklistItems"].includes(key))return dashboard();
  const current=idx==null?{}:(key==="checklistItems"?checklistItems(event)[idx]:entries(event,key)[idx])||{};
  const vendor=key==="vendorEntries",task=key==="checklistItems";
  const title=vendor?"Vendor":task?"Checklist task":key==="noteEntries"?"Planning note":"Lesson learned";
  const field=(name,label,value,textarea=false)=>`<label>${label}${textarea?`<textarea name="${name}" rows="4">${escapeText(value||"")}</textarea>`:`<input name="${name}" value="${escapeText(value||"")}" ${name==="name"||name==="title"||name==="text"?"required":""}>`}</label>`;
  return `<div class="vv-event-breadcrumb"><button type="button" class="secondary small" data-vv-event-entry-cancel>Cancel</button></div><div class="card vv-event-entry-panel"><h2>${idx==null?"Add New":"Edit"} ${title}</h2><form id="vv-event-entry-form" class="vv-event-form">${vendor?field("name","Vendor name",current.name)+field("description","What they do",current.description,true)+field("contact","Contact information (business details only)",current.contact,true):task?field("text","Task",current.text)+field("details","Instructions / details",current.details,true):field("title","Title",current.title)+field("body","Details",current.body,true)}<div class="actions"><button type="button" class="secondary" data-vv-event-entry-cancel>Cancel</button>${idx!=null?'<button type="button" class="danger" data-vv-event-entry-delete>Delete</button>':""}<button type="submit">Save ${title.toLowerCase()}</button></div></form></div>`;
 }
 function entryDetails(){
  const event=items.find(x=>x.id===selected),key=entryDetail?.key,idx=entryDetail?.index;
  const r=key==="checklistItems"?checklistItems(event)[idx]:entries(event,key)[idx];
  if(!r)return dashboard();
  return `<div class="vv-event-breadcrumb"><button type="button" class="secondary small" data-vv-event-entry-cancel>Cancel</button></div><div class="card vv-event-entry-panel"><div class="vv-event-section-head"><h2>${escapeText(r.name||r.title||r.text)}</h2><button type="button" data-vv-event-entry-edit>Edit</button></div>${r.description?section("What they do",r.description,""):""}${r.contact?section("Contact information",r.contact,""):""}${r.body?section("Details",r.body,""):""}${r.details?section("Instructions",r.details,""):""}</div>`;
 }
 function checklistItems(e){return Array.isArray(e.checklistItems)?e.checklistItems:((e.checklist||"").split(/[\n;]+/).map(t=>t.trim()).filter(Boolean).map(text=>({text,done:false})));}
 function overview(){
  return `<div class="card"><div class="vv-event-toolbar"><div><h1>Events</h1><p class="helper">Events sorted by date. Select one to open its planning and history dashboard.</p></div><div class="vv-event-toolbar-actions"><button type="button" data-vv-event-new>+ Add event</button><button type="button" class="secondary" data-vv-event-import>Import CSV</button><button type="button" class="secondary vv-event-danger" data-vv-event-clear>Delete all events</button></div></div>${tiles()}</div>`;
 }
 function fields(e){
  return `<form id="vv-event-form" class="vv-event-form"><label>Event name<input name="title" value="${escapeText(e.title||"")}" required maxlength="140"></label><label>Date<input type="date" name="date" value="${escapeText(e.date||"")}" required></label>${e.id?`<label>Campus<select name="schoolId">${options(e.schoolId)}</select></label>`:""}<div class="actions"><button type="button" class="secondary" data-vv-event-cancel>Cancel</button>${e.id?'<button type="button" class="danger" data-vv-event-delete>Delete event</button>':""}<button type="submit">Save</button></div></form>`;
 }
 function editor(){const e=editing&&selected?items.find(x=>x.id===selected)||{}:{};return `<div class="vv-event-breadcrumb"><button type="button" class="secondary small" data-vv-event-cancel>← Back</button></div><div class="card"><h1>${e.id?"Edit event name & date":"Add event"}</h1>${fields(e)}</div>`;}
 function renderChecklist(e){const tasks=checklistItems(e);return `<div class="vv-event-checklist">${tasks.map((t,i)=>`<div class="vv-event-task-row"><label><input type="checkbox" data-vv-event-check="${i}" ${t.done?"checked":""}><span>${escapeText(t.text)}</span></label><button type="button" class="secondary small" data-vv-event-task-detail="${i}">Details</button></div>`).join("")||'<p class="helper">No tasks yet.</p>'}</div>`;}
 function sectionEditor(){const e=items.find(x=>x.id===selected),key=activeSection;const names={description:"Overview",checklist:"Preparation checklist",vendors:"Supplies & vendors",notes:"Planning notes",lessons:"Lessons learned",time:"Time",recurrence:"Frequency"};if(!e||!names[key])return dashboard();const value=key==="checklist"?(Array.isArray(e.checklistItems)?e.checklistItems.map(x=>x.text).join("\n"):e.checklist||""):e[key]||"";return `<div class="vv-event-breadcrumb"><button type="button" class="secondary small" data-vv-event-section-cancel>Cancel</button></div><div class="card"><h2>${names[key]}</h2><form id="vv-event-section-form"><label>${names[key]}${key==="time"?`<input type="time" name="content" value="${escapeText(value)}">`:`<textarea name="content" rows="${key==="checklist"?9:7}" placeholder="${key==="checklist"?"One task per line":"Add notes here"}">${escapeText(value)}</textarea>`}</label><p class="helper">${key==="checklist"?"One checklist task per line. You can mark tasks complete on the dashboard.":"Saved to this event in Firebase."}</p><div class="actions"><button type="button" class="secondary" data-vv-event-section-cancel>Cancel</button><button type="submit">Save section</button></div></form></div>`;}
 function csvParse(text){
  const result=[];let row=[],field="",quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++}else if(c==='"')quoted=false;else field+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(field);field=""}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))result.push(row);row=[];field=""}else field+=c;}row.push(field);if(row.some(x=>x.trim()))result.push(row);return result;
 }
 function importParse(text){
  const rows=csvParse(text);if(rows.length<2)throw Error("CSV needs a header and at least one event.");
  const headers=rows[0].map(x=>x.toLowerCase().replace(/[^a-z0-9]/g,""));
  const aliases={title:["title","event","eventname","name"],date:["date","eventdate","startdate"],school:["school","campus","location","schoolid"],description:["description","details","summary"],time:["time","starttime"],recurrence:["recurrence","repeat","frequency"],checklist:["checklist","tasks"],vendors:["vendors","vendor"],notes:["notes","planningnotes"],lessons:["lessons","lessonslearned","whatworked"],year:["year"],image:["image","imagepath","imageurl"],category:["category","type"],endDate:["enddate"],sourceDateLabel:["sourcedatelabel"]};
  const get=(r,k)=>{const i=headers.findIndex(h=>aliases[k].includes(h));return i<0?"":String(r[i]||"").trim()};
  if(!headers.some(h=>aliases.title.includes(h))||!headers.some(h=>aliases.date.includes(h)))throw Error("Required CSV columns: title and date.");
  if(rows.length>501)throw Error("Import up to 500 events at once.");
  const categoryIndex=headers.indexOf("category");
  const onsiteCategories=new Set(["school event","graduation"]);
  const importableRows=rows.slice(1).filter(r=>categoryIndex<0||onsiteCategories.has(String(r[categoryIndex]||"").trim().toLowerCase()));
  return importableRows.map((r,i)=>{const raw=get(r,"school"),sc=available().find(s=>s.id===raw||s.name.toLowerCase()===raw.toLowerCase()),schoolId=sc?.id||(!raw&&available().length===1?available()[0].id:"");const date=get(r,"date");if(!schoolId)throw Error(`Row ${i+2}: unknown or missing campus.`);if(!get(r,"title"))throw Error(`Row ${i+2}: missing title.`);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(new Date(date+"T12:00:00").getTime()))throw Error(`Row ${i+2}: date must be YYYY-MM-DD.`);return {title:get(r,"title"),date,schoolId,...Object.fromEntries(["time","recurrence","description","checklist","vendors","notes","lessons","year","category","endDate","sourceDateLabel"].map(k=>[k,get(r,k)]))};});
 }
 function importer(){
  return `<div class="vv-event-breadcrumb"><button type="button" class="secondary small" data-vv-event-cancel>← All events</button></div><div class="card"><h1>Import events</h1><p>Upload a CSV to create event tiles and their planning dashboards. If your CSV includes a category column, only School event and Graduation records will be imported; closures, meetings, conferences, and awareness days are skipped.</p><p class="helper">Required columns: <strong>title, date, school</strong>. Optional: time, description, recurrence, checklist, vendors, notes, lessons, year, category, image. Images are uploaded individually within each event and saved to Firebase. Use YYYY-MM-DD dates and an existing campus name.</p><p><a href="OVA_2026_Events_By_Campus.csv" download>Download OVA 2026 CSV</a> · <a href="events-import-template.csv" download>Blank template</a></p><label>CSV file<input type="file" accept=".csv,text/csv" data-vv-event-file></label><div id="vv-event-preview"></div><div class="actions"><button type="button" class="secondary" data-vv-event-cancel>Cancel</button><button type="button" data-vv-event-commit disabled>Import events</button></div></div>`;
 }
 function render(){
  if(!root())shell();
  const popupModes=["edit","section","entry","entryDetail"];
  const popup=popupModes.includes(mode);
  const content=mode==="edit"?editor():mode==="section"?sectionEditor():mode==="entry"?entryForm():mode==="entryDetail"?entryDetails():mode==="import"?importer():selected?dashboard():overview();
  root().innerHTML=popup
    ?`${selected?dashboard():overview()}<div class="vv-event-modal-backdrop" data-vv-event-modal-backdrop><div class="vv-event-modal" role="dialog" aria-modal="true" aria-label="Event editor"><button type="button" class="vv-event-modal-close" data-vv-event-modal-close aria-label="Close">×</button>${content}</div></div>`
    :content;
  if(popup){const focus=root().querySelector('.vv-event-modal input, .vv-event-modal textarea, .vv-event-modal button');focus?.focus();}
}
 async function refresh(){const ids=schoolIds();const results=await Promise.all(ids.map(id=>getDocs(query(collection(db,"events"),where("schoolId","==",id)))));items=results.flatMap(s=>s.docs.map(d=>({id:d.id,...d.data()})));render();}
 async function open(){selected=null;mode="grid";shell();root().innerHTML='<div class="card"><p>Loading events…</p></div>';try{await refresh()}catch(e){root().innerHTML=`<div class="card"><h2>Unable to load events</h2><p>${esc(e.message)}</p><p class="helper">Check that the updated Firestore rules have been deployed.</p><button data-vv-event-retry>Retry</button></div>`;}}
 async function click(e){
  if(!e.target.closest("#vv-events-root"))return false;
  if(e.target.closest("[data-vv-event-modal-close]") || e.target.matches("[data-vv-event-modal-backdrop]")){
    mode="grid";entryEditor=null;entryDetail=null;activeSection=null;render();return true;
  }

  const el=e.target.closest("[data-vv-event-open]");if(el){selected=el.dataset.vvEventOpen;mode="grid";render();return true;}
  if(e.target.closest("[data-vv-event-back]")){selected=null;mode="grid";render();return true;}
  if(e.target.closest("[data-vv-event-new]")){selected=null;editing=false;mode="edit";render();return true;}
  if(e.target.closest("[data-vv-event-edit]")){editing=true;mode="edit";render();return true;}
  const sectionButton=e.target.closest("[data-vv-event-section]");if(sectionButton){activeSection=sectionButton.dataset.vvEventSection;mode="section";render();return true;}
  if(e.target.closest("[data-vv-event-section-cancel]")){mode="grid";activeSection=null,entryEditor=null,entryDetail=null;render();return true;}
  if(e.target.closest("[data-vv-event-add-task]")){entryEditor={key:"checklistItems",index:null};mode="entry";render();return true;}
  const addEntry=e.target.closest("[data-vv-event-add-entry]");if(addEntry){entryEditor={key:addEntry.dataset.vvEventAddEntry,index:null};mode="entry";render();return true;}
  const openEntry=e.target.closest("[data-vv-event-entry]");if(openEntry){const [key,index]=openEntry.dataset.vvEventEntry.split(":");entryDetail={key,index:Number(index)};mode="entryDetail";render();return true;}
  const taskDetail=e.target.closest("[data-vv-event-task-detail]");if(taskDetail){entryDetail={key:"checklistItems",index:Number(taskDetail.dataset.vvEventTaskDetail)};mode="entryDetail";render();return true;}
  if(e.target.closest("[data-vv-event-entry-edit]")){entryEditor={...entryDetail};mode="entry";render();return true;}
  if(e.target.closest("[data-vv-event-entry-cancel]")){entryEditor=null;entryDetail=null;mode="grid";render();return true;}
  if(e.target.closest("[data-vv-event-entry-delete]")){const item=items.find(x=>x.id===selected);if(!item||!canManage(item.schoolId))return true;if(!confirm("Delete this entry?"))return true;const {key,index}=entryEditor||entryDetail||{};const values=(key==="checklistItems"?checklistItems(item):entries(item,key)).filter((_,i)=>i!==index);try{await updateDoc(doc(db,"events",selected),{[key]:values,updatedAt:serverTimestamp()});mode="grid";await refresh();toast("Entry deleted.")}catch(err){toast(err.message)}return true;}

  if(e.target.closest("[data-vv-event-import]")){mode="import";importRows=[];render();return true;}
  if(e.target.closest("[data-vv-event-clear]")){
    const deletable=items.filter(item=>canManage(item.schoolId));
    if(!deletable.length){toast("No events available to delete.");return true;}
    const typed=prompt(`Permanently delete ${deletable.length} event record(s) from Firebase across your accessible campuses? This cannot be undone. Type DELETE ALL to continue.`);
    if(typed!=="DELETE ALL")return true;
    if(!confirm(`Final confirmation: delete ${deletable.length} events permanently?`))return true;
    const button=e.target.closest("[data-vv-event-clear]");button.disabled=true;button.textContent="Deleting events…";
    let deleted=0,failed=0;
    for(const item of deletable){
      try{await deleteDoc(doc(db,"events",item.id));deleted++;}
      catch(error){failed++;console.error("Event deletion failed",item.id,error);}
    }
    try{await refresh()}catch(error){toast(`Deleted ${deleted}; refresh failed: ${error.message}`);return true;}
    toast(failed?`Deleted ${deleted} events; ${failed} failed. Please check permissions.`:`Deleted ${deleted} events from Firebase.`);
    return true;
  }

  if(e.target.closest("[data-vv-event-cancel]")){mode="grid";render();return true;}
  if(e.target.closest("[data-vv-event-retry]")){await open();return true;}
  if(e.target.closest("[data-vv-event-delete]")){if(!selected||!confirm("Delete this event record?"))return true;try{const item=items.find(x=>x.id===selected);if(!canManage(item.schoolId))throw Error("No permission for this campus.");await deleteDoc(doc(db,"events",selected));selected=null;mode="grid";await refresh();toast("Event deleted.")}catch(err){toast(err.message)}return true;}
  if(e.target.closest("[data-vv-event-commit]")){const button=e.target.closest("[data-vv-event-commit]");button.disabled=true;let count=0;try{for(const item of importRows){if(!canManage(item.schoolId))throw Error("No access to selected campus.");await addDoc(collection(db,"events"),{...item,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});count++;}mode="grid";await refresh();toast(`${count} event(s) imported.`)}catch(err){toast(`${count} imported before error: ${err.message}`);button.disabled=false;}return true;}
  return false;
 }
 async function change(e){
  if(!e.target.closest("#vv-events-root"))return false;
  if(e.target.matches("[data-vv-event-check]")){
    const item=items.find(x=>x.id===selected);if(!item||!canManage(item.schoolId))return true;
    const tasks=Array.isArray(item.checklistItems)?item.checklistItems.map(x=>({...x})):(item.checklist||"").split(/[\n;]+/).map(x=>x.trim()).filter(Boolean).map(text=>({text,done:false}));
    const n=Number(e.target.dataset.vvEventCheck);if(!tasks[n])return true;tasks[n].done=e.target.checked;
    try{await updateDoc(doc(db,"events",item.id),{checklistItems:tasks,updatedAt:serverTimestamp()});item.checklistItems=tasks;}catch(err){toast(err.message);render();}return true;
  }
  if(e.target.matches("[data-vv-event-image]")){
   const file=e.target.files?.[0],id=e.target.dataset.vvEventImage,item=items.find(x=>x.id===id);
   if(!file||!item)return true;
   if(!canManage(item.schoolId)){toast("You cannot edit this campus's events.");return true;}
   try{const imageData=await resizeImage(file,420,0.78,{maxBytes:380000});await updateDoc(doc(db,"events",id),{imageData,updatedAt:serverTimestamp()});await refresh();toast("Event image saved to Firebase.");}catch(err){toast(err.message||"Unable to save image.");}return true;
  }
  if(e.target.matches("[data-vv-event-campus]")){campus=e.target.value;render();return true;}
  if(e.target.matches("[data-vv-event-file]")){const file=e.target.files?.[0];if(!file)return true;try{if(file.size>2e6)throw Error("Maximum CSV size is 2 MB.");importRows=importParse(await file.text());document.getElementById("vv-event-preview").innerHTML=`<p><strong>${importRows.length} events ready</strong></p><div class="vv-event-import-preview">${importRows.slice(0,100).map(x=>`<div>${esc(x.title)} · ${esc(x.date)} · ${esc(schoolName(x.schoolId))}</div>`).join("")}</div>`;root().querySelector("[data-vv-event-commit]").disabled=!importRows.length;}catch(err){importRows=[];document.getElementById("vv-event-preview").textContent=err.message;root().querySelector("[data-vv-event-commit]").disabled=true;}return true;}
  return false;
 }
 function input(e){if(e.target.matches("[data-vv-event-search]")){term=e.target.value;const grid=root().querySelector(".vv-event-tile-grid");if(grid)grid.outerHTML=tiles();return true;}return false;}
 async function submitEntry(e){if(e.target.id!=="vv-event-entry-form")return false;e.preventDefault();const item=items.find(x=>x.id===selected);if(!item||!canManage(item.schoolId)){toast("No permission to edit this event.");return true;}const {key,index}=entryEditor;const record=Object.fromEntries(new FormData(e.target));const values=(key==="checklistItems"?checklistItems(item):entries(item,key)).map(x=>({...x}));if(index==null)values.push({...record,id:crypto.randomUUID(),...(key==="checklistItems"?{done:false}:{})});else values[index]={...values[index],...record};try{await updateDoc(doc(db,"events",selected),{[key]:values,updatedAt:serverTimestamp()});mode="grid";entryEditor=null;entryDetail=null;await refresh();toast("Saved.")}catch(err){toast(err.message)}return true;}
 async function submitSection(e){if(e.target.id!=="vv-event-section-form")return false;e.preventDefault();const item=items.find(x=>x.id===selected);if(!item||!canManage(item.schoolId)){toast("No permission to edit this event.");return true;}const content=String(new FormData(e.target).get("content")||"");const key=activeSection;const patch=key==="checklist"?{checklist:content,checklistItems:content.split(/\n/).map(x=>x.trim()).filter(Boolean).map(text=>({text,done:false}))}:{[key]:content};try{await updateDoc(doc(db,"events",item.id),{...patch,updatedAt:serverTimestamp()});mode="grid";activeSection=null,entryEditor=null,entryDetail=null;await refresh();toast("Section saved.")}catch(err){toast(err.message)}return true;}
 async function submit(e){if(e.target.id!=="vv-event-form")return false;e.preventDefault();const data=Object.fromEntries(new FormData(e.target));if(!data.schoolId) data.schoolId=available()[0]?.id;if(!canManage(data.schoolId)){toast("No permission for this campus.");return true;}try{if(editing&&selected)await updateDoc(doc(db,"events",selected),{...data,updatedAt:serverTimestamp()});else{const ref=await addDoc(collection(db,"events"),{...data,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});selected=ref.id;}mode="grid";await refresh();toast("Event saved.");}catch(err){toast(err.message)}return true;}
 return {open,render,click,change,input,submit,submitSection,submitEntry};
}
