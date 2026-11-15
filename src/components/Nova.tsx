import { useEffect, useRef, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Avatar, Box, Chip, Fab, FormControlLabel, Checkbox, IconButton, Link, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import DeleteOutline from '@mui/icons-material/DeleteOutlineOutlined';
import VolumeUpOutlined from '@mui/icons-material/VolumeUpOutlined';
import VolumeOffOutlined from '@mui/icons-material/VolumeOffOutlined';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import { sourceAnswer } from '../rag.mjs';

type Src = { title: string; url: string; agency: string };
type Chunk = { id: string; title: string; text: string; kind: string; sources: Src[] };
type Corpus = { chunks: Chunk[]; contentHash: string; sourceReviewDate: string };
type Reply = { mode: string; answer: string; citations: Chunk[]; notice: string };
type Message = { id: number; question: string; reply: Reply };

const PROMPTS = ['How does AstroCare detect unusual readings?', 'What is the psychomotor vigilance test?', 'What is the conformal expected range?', 'Which datasets do you use?'];

export default function Nova() {
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(false);
  const [available, setAvailable] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const serial = useRef(0);
  const api = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

  useEffect(() => {
    if (!open || corpus) return;
    let live = true;
    fetch(`${import.meta.env.BASE_URL}knowledge-base.json`).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => live && setCorpus(d)).catch(() => live && setError('Evidence library unavailable. Reconnect and reload.'));
    fetch(api + '/api/chat/status', { signal: AbortSignal.timeout(4000) }).then((r) => (r.ok ? r.json() : null)).then((d) => live && setAvailable(d?.generation_enabled === true)).catch(() => {});
    return () => { live = false; };
  }, [open, corpus, api]);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);
  useEffect(() => {
    if (!voice || !open || !messages.length || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(messages.at(-1)!.reply.answer.replace(/\[\d+\]/g, ''));
    window.speechSynthesis.speak(u);
    return () => window.speechSynthesis.cancel();
  }, [messages, voice, open]);

  async function ask(value: string) {
    const q = value.trim();
    if (!q || busy || !corpus) return;
    setBusy(true);
    setQuestion('');
    setError('');
    let reply = sourceAnswer(q, corpus) as Reply;
    if (ai && available && reply.mode === 'retrieval') {
      try {
        const res = await fetch(api + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, generate: true }), signal: AbortSignal.timeout(25000) });
        if (!res.ok) throw Error();
        const body = await res.json();
        if (!Array.isArray(body.citations) || typeof body.answer !== 'string') throw Error();
        reply = body;
      } catch {
        reply = { ...reply, notice: 'AI synthesis unavailable, showing source excerpts.' };
      }
    }
    setMessages((old) => [...old, { id: ++serial.current, question: q, reply }].slice(-12));
    setBusy(false);
  }

  return (
    <Box className="no-print">
      {open && (
        <Paper elevation={8} sx={{ position: 'fixed', right: 20, bottom: 88, zIndex: 1300, width: 'min(420px, calc(100vw - 40px))', height: 'min(620px, calc(100vh - 120px))', display: 'flex', flexDirection: 'column', borderRadius: 3, overflow: 'hidden', border: 1, borderColor: 'divider' }} aria-label="Nova evidence assistant">
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Avatar sx={{ bgcolor: 'secondary.main', width: 34, height: 34 }}><AutoStoriesOutlined fontSize="small" /></Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 600, lineHeight: 1.2 }}>Nova</Typography>
              <Typography variant="caption" color="text.secondary">{ai && available ? 'AI synthesis over retrieved sources' : 'Evidence search · runs on this device'}</Typography>
            </Box>
            <Tooltip title={voice ? 'Stop reading aloud' : 'Read answers aloud'}><IconButton size="small" onClick={() => setVoice(!voice)}>{voice ? <VolumeOffOutlined fontSize="small" /> : <VolumeUpOutlined fontSize="small" />}</IconButton></Tooltip>
            <Tooltip title="Clear"><IconButton size="small" onClick={() => setMessages([])}><DeleteOutline fontSize="small" /></IconButton></Tooltip>
            <IconButton size="small" onClick={() => setOpen(false)} aria-label="Close Nova"><CloseRounded fontSize="small" /></IconButton>
          </Stack>
          <Box ref={scroll} sx={{ flex: 1, overflowY: 'auto', px: 2, py: 2 }} role="log" aria-live="polite">
            {!messages.length && <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>Ask about how AstroCare monitors, its datasets and models, or space-health research. Answers quote and cite the source library. Nova cannot diagnose or recommend treatment.</Typography>}
            <Stack spacing={2}>
              {messages.map((m) => (
                <Box key={m.id}>
                  <Box sx={{ ml: 'auto', width: 'fit-content', maxWidth: '85%', bgcolor: 'primary.main', color: 'primary.contrastText', px: 1.5, py: 1, borderRadius: 2, borderBottomRightRadius: 4, fontSize: 14 }}>{m.question}</Box>
                  <Box sx={(t) => ({ mt: 1, maxWidth: '95%', border: 1, borderColor: m.reply.mode === 'safety' ? 'error.main' : 'divider', bgcolor: m.reply.mode === 'safety' ? alpha(t.palette.error.main, 0.06) : 'action.hover', px: 1.5, py: 1.25, borderRadius: 2, borderBottomLeftRadius: 4 })}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>{m.reply.answer}</Typography>
                    <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.75 }}>{m.reply.notice}</Typography>
                    {m.reply.citations.length > 0 && (
                      <Accordion disableGutters elevation={0} sx={{ bgcolor: 'transparent', '&:before': { display: 'none' }, mt: 0.5 }}>
                        <AccordionSummary expandIcon={<ExpandMoreRounded />} sx={{ px: 0, minHeight: 32, '& .MuiAccordionSummary-content': { my: 0 } }}>
                          <Typography variant="body2" color="primary">Evidence ({m.reply.citations.length})</Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ px: 0, pt: 0 }}>
                          <Stack spacing={1}>
                            {m.reply.citations.map((c, i) => (
                              <Box key={c.id}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>[{i + 1}] {c.title}</Typography>
                                {c.sources.map((s) => <Link key={s.url} variant="caption" sx={{ display: "block" }} noWrap href={s.url.startsWith('/') ? import.meta.env.BASE_URL + s.url.slice(1) : s.url} target="_blank" rel="noreferrer">{s.agency}: {s.title}</Link>)}
                              </Box>
                            ))}
                          </Stack>
                        </AccordionDetails>
                      </Accordion>
                    )}
                  </Box>
                </Box>
              ))}
            </Stack>
            {busy && <Typography variant="caption" color="text.secondary">Retrieving evidence…</Typography>}
          </Box>
          {error && <Typography variant="caption" color="error" sx={{ px: 2 }}>{error}</Typography>}
          <Box sx={{ borderTop: 1, borderColor: 'divider', p: 1.5 }}>
            {!messages.length && (
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
                {PROMPTS.map((p) => <Chip key={p} size="small" variant="outlined" label={p} disabled={!corpus || busy} onClick={() => void ask(p)} />)}
              </Stack>
            )}
            <Stack direction="row" spacing={1} component="form" onSubmit={(e) => { e.preventDefault(); void ask(question); }}>
              <TextField size="small" fullWidth autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask Nova…" disabled={busy} slotProps={{ htmlInput: { maxLength: 800, 'aria-label': 'Your question' } }} />
              <IconButton type="submit" color="primary" disabled={busy || !question.trim() || !corpus} aria-label="Send"><SendRounded /></IconButton>
            </Stack>
            {available && <FormControlLabel sx={{ mt: 0.5 }} control={<Checkbox size="small" checked={ai} onChange={(e) => setAi(e.target.checked)} />} label={<Typography variant="caption">Use AI synthesis (question + public evidence only; never health records)</Typography>} />}
          </Box>
        </Paper>
      )}
      <Fab variant="extended" color="secondary" onClick={() => setOpen(!open)} aria-expanded={open} sx={{ position: 'fixed', right: 20, bottom: 20, zIndex: 1300, textTransform: 'none', fontWeight: 600 }}>
        {open ? <CloseRounded sx={{ mr: 1 }} /> : <ForumOutlined sx={{ mr: 1 }} />}
        {open ? 'Close' : 'Ask Nova'}
      </Fab>
    </Box>
  );
}
