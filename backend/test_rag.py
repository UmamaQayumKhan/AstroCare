import io,json,os,unittest
from unittest.mock import patch
from backend import rag

class RagTests(unittest.TestCase):
    def setUp(self):
        self.corpus=rag.load_corpus()
        self.fallback=rag.source_answer('How accurate is the glucose model?',self.corpus)
    def mock_response(self,source):
        answer={'supported':True,'statements':[{'text':'This is a research glucose model.','source_ids':[source]}]}
        return io.BytesIO(json.dumps({'output':[{'content':[{'type':'output_text','text':json.dumps(answer)}]}]}).encode())
    def test_retrieval_and_abstention(self):
        self.assertIn('model-Glucose',[c['id'] for c in self.fallback['citations']])
        self.assertEqual(rag.source_answer('What is the capital of France?',self.corpus)['mode'],'insufficient')
    def test_no_key_means_no_provider_call(self):
        with patch.dict(os.environ,{},clear=True),patch('backend.rag.urlopen') as call:
            self.assertFalse(rag.generation_enabled())
            self.assertEqual(rag.generate('glucose',self.fallback)['mode'],'retrieval');call.assert_not_called()
    def test_valid_citations_and_minimal_payload(self):
        with patch.dict(os.environ,{'ASTROCARE_RAG_ENABLED':'1','OPENAI_API_KEY':'test-only','OPENAI_MODEL':'test-model'}),patch('backend.rag.urlopen',return_value=self.mock_response('model-Glucose')) as call:
            result=rag.generate('glucose model error',self.fallback)
            self.assertEqual(result['mode'],'rag')
            self.assertEqual(result['citations'][0]['id'],'model-Glucose')
            payload=json.loads(call.call_args.args[0].data)
            self.assertFalse(payload['store'])
            context=json.loads(payload['input'])
            self.assertEqual(set(context),{'question','evidence'})
            self.assertNotIn('test-only',payload['input'])
    def test_unknown_citation_is_rejected(self):
        with patch.dict(os.environ,{'ASTROCARE_RAG_ENABLED':'1','OPENAI_API_KEY':'test-only','OPENAI_MODEL':'test-model'}),patch('backend.rag.urlopen',return_value=self.mock_response('invented-source')):
            self.assertEqual(rag.generate('glucose',self.fallback)['mode'],'retrieval')
    def test_provider_failure_falls_back(self):
        with patch.dict(os.environ,{'ASTROCARE_RAG_ENABLED':'1','OPENAI_API_KEY':'test-only','OPENAI_MODEL':'test-model'}),patch('backend.rag.urlopen',side_effect=TimeoutError):
            self.assertEqual(rag.generate('glucose',self.fallback)['answer'],self.fallback['answer'])
    def test_emergency_never_calls_model(self):
        urgent=rag.source_answer('Someone collapsed',self.corpus)
        with patch('backend.rag.urlopen') as call:
            self.assertEqual(rag.generate('Someone collapsed',urgent)['mode'],'safety');call.assert_not_called()

if __name__=='__main__':unittest.main()
