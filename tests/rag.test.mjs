import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {sourceAnswer,retrieve,boundary} from '../src/rag.mjs';
const corpus=JSON.parse(await readFile(new URL('../public/knowledge-base.json',import.meta.url),'utf8'));
const cases=[
 ['Which datasets do you use?','datasets-overview'],
 ['Was NASA OSD-575 used for training?','dataset-nasa'],
 ['How accurate is the glucose model?','model-Glucose'],
 ['What is the heart rate model error?','model-HR'],
 ['How do I measure heart rate?','measure-heartRate'],
 ['How do I measure blood pressure?','measure-bloodPressure'],
 ['What is the NHANES sleep dataset?','dataset-nhanes'],
 ['Is mood a depression diagnosis?','clinical-limits'],
 ['What does isolation mean?','hazard-isolation'],
 ['How is space radiation monitored?','source-radiation'],
 ['How does Nova RAG work?','rag-method'],
 ['Where are my profiles and chat stored?','privacy']
];
test('retrieval covers the actual dataset, measurement and limitations questions',()=>{
 const failures=[];for(const [q,id] of cases){const answer=sourceAnswer(q,corpus);if(!answer.citations.some(c=>c.id===id))failures.push({q,expected:id,actual:answer.citations.map(c=>c.id)})}assert.deepEqual(failures,[]);
});
test('unsupported and empty questions abstain',()=>{for(const q of ['','the and what','What is the capital of France?','Predict tomorrow’s lottery numbers'])assert.equal(sourceAnswer(q,corpus).mode,'insufficient')});
test('urgent and treatment questions bypass retrieval',()=>{assert.equal(boundary('My crewmate collapsed'),'urgent');assert.equal(sourceAnswer('How much insulin dose should I take?',corpus).mode,'safety');assert.equal(sourceAnswer('I have chest pain',corpus).citations[0].id,'emergency-boundary')});
test('corpus integrity and citation provenance are auditable',()=>{assert.equal(createHash('sha256').update(JSON.stringify(corpus.chunks)).digest('hex'),corpus.contentHash);assert.equal(new Set(corpus.chunks.map(c=>c.id)).size,corpus.chunks.length);for(const c of corpus.chunks){assert.ok(c.text&&c.kind);assert.ok(c.sources.length);for(const s of c.sources)assert.match(s.url,/^(https:\/\/|\/)/)}});
test('research error comes from the recorded result, not an invented accuracy percent',()=>{const m=corpus.chunks.find(c=>c.id==='model-Glucose');assert.match(m.text,/32\.02 mg\/dL/);assert.match(m.text,/not an accuracy percentage/);assert.match(corpus.chunks.find(c=>c.id==='dataset-nasa').text,/No model was trained/)});

test('personal numbers are not interpreted and urgent symptoms take priority',()=>{assert.equal(sourceAnswer('My glucose is 200',corpus).mode,'safety');assert.equal(boundary('My heart rate is 200 and I have chest pain'),'urgent')});
