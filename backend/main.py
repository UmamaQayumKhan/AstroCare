"""Local demonstration API. Bind to loopback; no production identity/authentication."""
import json
import os
import sqlite3
from datetime import datetime,timezone,timedelta
from typing import Literal
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import JSONResponse
from starlette.datastructures import MutableHeaders
from pydantic import BaseModel, Field, model_validator
from .rag import generation_enabled,load_corpus,source_answer,generate

class LocalBoundaryMiddleware:
    """Pure ASGI boundary avoids BaseHTTPMiddleware streaming/deadlock issues."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        client = scope.get('client')
        host = client[0] if client else None
        headers = {key.decode('latin-1').lower(): value.decode('latin-1') for key, value in scope.get('headers', [])}
        error = boundary_error(host, headers.get('origin'))
        if error:
            return await JSONResponse({'detail':error},status_code=403)(scope, receive, send)

        async def secure_send(message):
            if message['type'] == 'http.response.start':
                response_headers = MutableHeaders(scope=message)
                response_headers['Cache-Control'] = 'no-store'
                response_headers['X-Content-Type-Options'] = 'nosniff'
            await send(message)

        return await self.app(scope, receive, secure_send)

def boundary_error(host, origin):
    allowed_origins = [os.getenv('ASTROCARE_ORIGIN','http://localhost:5173'),'http://127.0.0.1:5173','http://127.0.0.1:4173']
    if host not in ['127.0.0.1','::1','testclient']:
        return 'Local development API: non-loopback requests are disabled.'
    if origin and origin not in allowed_origins:
        return 'Origin is not allowed.'
    return None

app = FastAPI(title='AstroCare Mission Health', version='1.0.0')
app.add_middleware(CORSMiddleware, allow_origins=[os.getenv('ASTROCARE_ORIGIN', 'http://localhost:5173'), 'http://127.0.0.1:5173', 'http://127.0.0.1:4173'], allow_methods=['GET','POST'], allow_headers=['Content-Type'])
app.add_middleware(TrustedHostMiddleware,allowed_hosts=['localhost','127.0.0.1','[::1]','testserver'])
app.add_middleware(LocalBoundaryMiddleware)

class ChatQuestion(BaseModel):
    question: str = Field(min_length=2,max_length=800)
    generate: bool = False

def local_request(request:Request):
    return bool(request.client and request.client.host in ['127.0.0.1','::1','testclient'])

@app.get('/api/chat/status')
def chat_status(request:Request):
    corpus=load_corpus()
    return {'generation_enabled':generation_enabled() and local_request(request),'mode':'local development backend','corpus_hash':corpus['contentHash'],'chunks':len(corpus['chunks'])}

@app.post('/api/chat')
def chat(body:ChatQuestion,request:Request):
    # Paid inference is deliberately local-only until production identity and
    # rate limiting are implemented. No secrets or records are sent to browser.
    if not local_request(request):raise HTTPException(403,'This development chat backend accepts loopback requests only.')
    origin=request.headers.get('origin')
    allowed=[os.getenv('ASTROCARE_ORIGIN','http://localhost:5173'),'http://127.0.0.1:5173','http://127.0.0.1:4173']
    if origin and origin not in allowed:raise HTTPException(403,'Origin is not allowed.')
    result=source_answer(body.question.strip(),load_corpus())
    return generate(body.question,result) if body.generate else result

class Reading(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    profile: str = Field(min_length=1, max_length=100)
    timestamp: datetime
    source: Literal['manual','simulated','sensor-sim']
    sync: str = 'pending'
    mission: str = Field(max_length=80)
    symptoms: str = Field(default='', max_length=2000)
    heartRate: float | None = Field(default=None, ge=20, le=250)
    systolic: float | None = Field(default=None, ge=40, le=300)
    diastolic: float | None = Field(default=None, ge=20, le=200)
    temperature: float | None = Field(default=None, ge=30, le=45)
    sleep: float | None = Field(default=None, ge=0, le=24)
    mood: float | None = Field(default=None, ge=1, le=5)
    glucose: float | None = Field(default=None, ge=10, le=1000)
    glucoseContext: str = Field(default='', max_length=200)

    @model_validator(mode='after')
    def validate_context(self):
        if not self.id.strip() or not self.profile.strip():
            raise ValueError('Record and profile IDs must not be blank')
        if self.mood is not None and not self.mood.is_integer():
            raise ValueError('Mood must be a whole number from 1 to 5')
        if self.systolic is not None and self.diastolic is not None and self.systolic <= self.diastolic:
            raise ValueError('Systolic must exceed diastolic')
        if self.glucose is not None and not self.glucoseContext.strip():
            raise ValueError('Glucose context required')
        if not self.symptoms.strip() and all(getattr(self, k) is None for k in ['heartRate','systolic','diastolic','temperature','sleep','mood','glucose']):
            raise ValueError('At least one observation required')
        if self.timestamp.tzinfo is None:
            raise ValueError('Timestamp must include timezone')
        if self.timestamp > datetime.now(timezone.utc)+timedelta(minutes=5):
            raise ValueError('Timestamp is in the future; check device clock')
        return self

def connection():
    conn = sqlite3.connect(os.getenv('ASTROCARE_DB', 'astrocare.db'))
    conn.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, profile TEXT NOT NULL, payload TEXT NOT NULL)')
    return conn

@app.get('/api/health')
def health():
    return {'ok': True, 'mode': 'local demonstration'}

@app.post('/api/records')
def save(reading: Reading):
    data = reading.model_dump(mode='json'); data['sync'] = 'synced'
    payload = json.dumps(data, sort_keys=True)
    with connection() as conn:
        old = conn.execute('SELECT payload FROM records WHERE id=?', (reading.id,)).fetchone()
        if old and old[0] != payload:
            raise HTTPException(409, 'Record ID already exists with different content')
        conn.execute('INSERT OR IGNORE INTO records VALUES (?,?,?)', (reading.id, reading.profile, payload))
    return {'id': reading.id, 'status': 'synced'}

@app.get('/api/records/{profile}')
def records(profile: str):
    with connection() as conn:
        return [json.loads(row[0]) for row in conn.execute('SELECT payload FROM records WHERE profile=? ORDER BY json_extract(payload,\'$.timestamp\')', (profile,))]
