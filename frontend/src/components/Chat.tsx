import { useEffect, useRef, useState } from 'react';
import './Chat.css';
import { fetchLatestRecord, postControl, sendChatMessage } from '../lib/api';
import { loadLocationContext } from '../lib/locationContext';

type Message = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
};

interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const initialMessages: Message[] = [
  {
    id: 1,
    role: 'assistant',
    text: 'Hi! I can help prepare EV charging commands. Try “Charge EV1 from solar and keep EV2 off.”',
  },
];

const CHAT_STORAGE_KEY = 'redox-ems-chat-messages';
const TTS_VOICE_STORAGE_KEY = 'redox-ems-tts-voice';
const TTS_PREVIEW_TEXT = 'Hello, I am your EMS assistant.';

function loadMessages(): Message[] {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!stored) return initialMessages;

    const messages = JSON.parse(stored) as Message[];
    return Array.isArray(messages) && messages.length > 0 ? messages : initialMessages;
  } catch {
    return initialMessages;
  }
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [sending, setSending] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      const savedVoiceUri = localStorage.getItem(TTS_VOICE_STORAGE_KEY);
      if (savedVoiceUri && availableVoices.some((voice) => voice.voiceURI === savedVoiceUri)) {
        setSelectedVoiceUri(savedVoiceUri);
      } else if (!selectedVoiceUri) {
        const preferredVoice = availableVoices.find((voice) => voice.lang.toLowerCase().startsWith('en'));
        setSelectedVoiceUri(preferredVoice?.voiceURI ?? availableVoices[0]?.voiceURI ?? '');
      }
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [selectedVoiceUri]);

  const getSelectedVoice = () =>
    voices.find((voice) => voice.voiceURI === selectedVoiceUri);

  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getSelectedVoice();
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  };

  const selectVoice = (voiceUri: string) => {
    setSelectedVoiceUri(voiceUri);
    localStorage.setItem(TTS_VOICE_STORAGE_KEY, voiceUri);
  };

  const previewVoice = () => speak(TTS_PREVIEW_TEXT);

  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  const toggleListening = () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechError('Speech recognition is not supported in this browser.');
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      setInput(event.results[0][0].transcript);
      setSpeechError('');
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setSpeechError('Could not access speech recognition.');
    };
    recognitionRef.current = recognition;
    setSpeechError('');
    setListening(true);
    recognition.start();
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setMessages((current) => [...current, { id: Date.now(), role: 'user', text }]);
    setInput('');
    setSending(true);

    try {
      const location = loadLocationContext();
      let latestTelemetry: Awaited<ReturnType<typeof fetchLatestRecord>> | null = null;
      try {
        latestTelemetry = await fetchLatestRecord();
      } catch {
        // Chat remains usable when telemetry is temporarily unavailable.
      }

      const response = await sendChatMessage(text, {
        location,
        latest_telemetry: latestTelemetry,
      });
      if (response.control) {
        await postControl(response.control);
      }
      const spokenReply = response.control
        ? `${response.reply} Control applied successfully.`
        : response.reply;
      speak(spokenReply);
      setMessages((current) => [
        ...current,
        {
          id: Date.now(),
          role: 'assistant',
          text: spokenReply,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: Date.now(),
          role: 'assistant',
          text: `I could not apply that request: ${(error as Error).message}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-page">
      <header className="chat-header">
        <div>
          <div className="chat-eyebrow">EMS assistant</div>
          <h1>AI Chat</h1>
        </div>
        <span className="mock-badge">{sending ? 'Thinking...' : 'Gemini connected'}</span>
      </header>

      <section className="chat-panel">
        <div className="chat-messages" aria-live="polite">
          {messages.map((message) => (
            <div className={`chat-message ${message.role}`} key={message.id}>
              <span className="message-label">{message.role === 'assistant' ? 'EMS AI' : 'You'}</span>
              <p>{message.text}</p>
            </div>
          ))}
        </div>

        <div className="chat-composer">
          <div className="tts-controls">
            <label htmlFor="tts-voice">Response voice</label>
            <select
              id="tts-voice"
              value={selectedVoiceUri}
              onChange={(event) => selectVoice(event.target.value)}
              disabled={voices.length === 0}
            >
              {voices.length === 0 && <option value="">No browser voices available</option>}
              {voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
            <button type="button" className="preview-button" onClick={previewVoice} disabled={!selectedVoiceUri}>
              Preview
            </button>
          </div>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Tell the EMS what to do..."
            aria-label="Chat message"
            rows={2}
          />
          <div className="composer-actions">
            <div>
              <button
                type="button"
                className={`speech-button ${listening ? 'listening' : ''}`}
                onClick={toggleListening}
                aria-label={listening ? 'Stop listening' : 'Use speech to text'}
                title={listening ? 'Stop listening' : 'Use speech to text'}
              >
                {listening ? '■' : '🎙'}
              </button>
              {speechError && <span className="speech-error">{speechError}</span>}
            </div>
            <button type="button" className="send-button" onClick={() => void sendMessage()} disabled={sending}>
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
