import pytest
from fastapi import HTTPException
from starlette.requests import Request
from backend.main import (
    ChatQuestion, Reading, boundary_error, chat, chat_status, health, records, save
)


def fake_request(host='testclient', origin=None):
    headers = [] if origin is None else [(b'origin', origin.encode())]
    return Request({'type':'http','method':'GET','path':'/','headers':headers,'client':(host,50000),'scheme':'http','server':('testserver',80),'query_string':b''})


def test_validation_and_idempotency(tmp_path, monkeypatch):
    monkeypatch.setenv('ASTROCARE_DB', str(tmp_path/'test.db'))
    data={'id':'test-1','profile':'aria','timestamp':'2026-11-14T10:00:00Z','source':'manual','mission':'Mars transit','sleep':7}
    reading=Reading.model_validate(data)
    assert health()['ok']
    assert save(reading)['status']=='synced'
    assert save(reading)['status']=='synced'
    assert len(records('aria'))==1
    with pytest.raises(HTTPException) as conflict:
        save(Reading.model_validate({**data,'sleep':8}))
    assert conflict.value.status_code==409
    for invalid in [{**data,'sleep':25},{**data,'glucose':90},{**data,'systolic':70,'diastolic':90}]:
        with pytest.raises(ValueError):
            Reading.model_validate(invalid)


def test_chat_routes_and_origin_boundary(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY',raising=False)
    request=fake_request()
    assert chat_status(request)['generation_enabled'] is False
    answer=chat(ChatQuestion(question='Which datasets do you use?'),request)
    assert answer['mode']=='retrieval'
    assert any(c['id']=='datasets-overview' for c in answer['citations'])
    answer=chat(ChatQuestion(question='Someone collapsed',generate=True),request)
    assert answer['mode']=='safety'


def test_invalid_mood_context_and_clock():
    data={'id':'test-invalid','profile':'test','timestamp':'2026-01-01T10:00:00Z','source':'manual','mission':'Mars transit'}
    for extra in [{'mood':3.5},{'glucose':100,'glucoseContext':'  '},{'sleep':7,'timestamp':'2999-01-01T10:00:00Z'},{'sleep':7,'profile':'  '}]:
        with pytest.raises(ValueError):
            Reading.model_validate({**data,**extra})


def test_local_api_host_and_origin_boundary():
    assert boundary_error('192.0.2.1',None)
    assert boundary_error('testclient','https://untrusted.invalid')
    assert boundary_error('127.0.0.1','http://127.0.0.1:5173') is None
    assert boundary_error('::1',None) is None


def test_simulated_wearable_snapshot_accepted(tmp_path, monkeypatch):
    monkeypatch.setenv('ASTROCARE_DB', str(tmp_path/'wearable.db'))
    data={'id':'snap-1','profile':'demo-calder','timestamp':'2026-11-14T10:00:00Z','source':'sensor-sim','mission':'Mars transit','heartRate':72,'systolic':118,'diastolic':76,'temperature':36.7}
    assert save(Reading.model_validate(data))['status']=='synced'
    with pytest.raises(ValueError):
        Reading.model_validate({**data,'source':'unknown-device'})
