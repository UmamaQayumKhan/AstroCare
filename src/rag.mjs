const STOP=new Set('a an and are as at be been can could do does for from how i in is it me my of on or our that the their these this to use used using was we what when which why with you your tell please about mean explain'.split(' '));
const DOMAIN=new Set(["dataset","nasa","osd","inspiration4","physionet","nhanes","cdc","glucose","sugar","heart","hr","pulse","pressure","systolic","diastolic","temperature","sleep","mood","depression","radiation","neutron","hazards","hazard","isolation","confinement","gravity","space","astronaut","astronauts","mission","health","model","models","accuracy","validation","training","test","error","mae","rmse","privacy","profile","profiles","chat","nova","rag","source","sources","evidence","citation","citations","symptom","symptoms","measurement","measurements","emergency","astrocare","conformal","baseline","trend","unusual","anomaly","alert","alerts","detect","reading","readings","monitor","wearable","live","forecast","biomarker","biomarkers","blood","dose","handover","delay","communication","fever","pvt","psychomotor","vigilance","reaction","cognitive","cognition","fatigue","lapse","lapses","exercise","countermeasure","countermeasures","bone","muscle","supplies","supply","inventory","kit","report","surgeon"]);
const ALIASES={hr:'heart',monitoring:'monitor',monitored:'monitor',datasets:'dataset',data:'dataset',trained:'training',train:'training',testing:'test',tested:'test',bp:'pressure',bpm:'heart',sugar:'glucose',sleeping:'sleep',sleepiness:'sleep',sad:'mood',depression:'mood',accuracy:'accuracy',accurate:'accuracy',validated:'validation',validate:'validation',radiations:'radiation',detects:'detect',detection:'detect',anomalies:'anomaly',trends:'trend',baselines:'baseline',flag:'alert',flags:'alert',flagged:'alert',biomarker:'biomarkers',sensor:'wearable',sensors:'wearable',interval:'range',intervals:'range'};
export function tokens(text){return (text.toLowerCase().match(/[a-z0-9]+/g)||[]).filter(w=>!STOP.has(w)).map(w=>ALIASES[w]||w)}
export function boundary(question){
 if(/\b(chest pain|collapsed|collapsing|unconscious|not breathing|cannot breathe|can't breathe|severe bleeding|kill myself|suicid\w*|overdose)\b/i.test(question))return 'urgent';
 if(/\b(my|i|reading)\b/i.test(question)&&/\d/.test(question)&&/\b(glucose|sugar|pressure|heart|pulse|temperature|mood|sleep)\b/i.test(question))return 'clinical';
 if(/\b(diagnos\w*|prescri\w*|dosage|dose|medicat\w*|treatment|treat me|am i (safe|healthy)|is my .*normal)\b/i.test(question))return 'clinical';
 return null;
}
export function retrieve(question,chunks,limit=3){
 const query=[...new Set(tokens(question))];if(!query.length||!query.some(q=>DOMAIN.has(q)))return [];
 const docs=chunks.map(c=>({chunk:c,t:tokens(c.title+' '+c.title+' '+c.text)}));
 const avg=docs.reduce((s,d)=>s+d.t.length,0)/docs.length;
 const df=new Map(query.map(q=>[q,docs.filter(d=>d.t.includes(q)).length]));
 const ranked=docs.map(d=>{let matched=0;const score=query.reduce((s,q)=>{const tf=d.t.filter(t=>t===q).length;if(!tf)return s;matched++;const idf=Math.log(1+(docs.length-(df.get(q)||0)+.5)/((df.get(q)||0)+.5));return s+idf*(tf*2.2)/(tf+1.2*(.25+.75*d.t.length/avg));},0);return {...d.chunk,score,matched}}).filter(d=>d.score>=1.2&&d.matched>=Math.min(2,query.length)).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 return ranked.slice(0,limit);
}
export function sourceAnswer(question,corpus){
 const restriction=boundary(question);
 if(restriction){const c=corpus.chunks.find(c=>c.id===(restriction==='urgent'?'emergency-boundary':'clinical-limits'));return {mode:'safety',answer:restriction==='urgent'?c.text:'I cannot diagnose, decide whether you are safe, or recommend treatment. '+c.text,citations:[c],notice:'This response is not an emergency assessment.'};}
 const hits=retrieve(question,corpus.chunks);
 if(!hits.length)return {mode:'insufficient',answer:'I could not find enough evidence in the current library to answer that. Try asking about a measurement, NASA hazards, datasets, model errors, or app limitations.',citations:[],notice:'No unsupported answer generated.'};
 return {mode:'retrieval',answer:hits.map((h,i)=>`[${i+1}] ${h.text}`).join('\n\n'),citations:hits,notice:'Source excerpts · no language-model generation'};
}
