"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/* Minimal typing for the browser Web Speech API (not in the TS DOM lib). */
type SpeechAlt = { transcript: string };
type SpeechRes = { isFinal: boolean; 0: SpeechAlt; length: number };
type SpeechEvt = { resultIndex: number; results: { length: number; [i: number]: SpeechRes } };
type SpeechErr = { error: string };
type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvt) => void) | null;
  onerror: ((e: SpeechErr) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognizerCtor = new () => Recognizer;

function getCtor(): RecognizerCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};
/** "unknown" on the server, then the real answer in the browser. */
function useSupport(): "unknown" | "yes" | "no" {
  return useSyncExternalStore(noop, () => (getCtor() ? "yes" : "no"), () => "unknown");
}

const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "The browser was not allowed to use the microphone. Allow the microphone for this site in the browser settings, or type instead.",
  "service-not-allowed": "The browser's speech service is turned off or blocked. Type instead.",
  "no-speech": "No speech was heard. Move closer to the microphone and try again, or type instead.",
  "audio-capture": "No microphone was found. Plug one in, or type instead.",
  network: "The browser's speech service could not be reached. Check your connection, or type instead.",
};

/** Speech to text with the browser's own speech service. Final text is appended through onFinal; nothing is ever made up. */
export default function MicButton({ onFinal }: { onFinal: (text: string) => void }) {
  const support = useSupport();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognizer | null>(null);
  const finalCb = useRef(onFinal);
  useEffect(() => {
    finalCb.current = onFinal;
  }, [onFinal]);
  useEffect(() => () => rec.current?.abort(), []);

  if (support === "unknown") return null;
  if (support === "no")
    return <p className="ask-bad" role="status">This browser cannot turn speech into text. Type instead; Chrome, Edge and Safari support it.</p>;

  const start = () => {
    const Ctor = getCtor();
    if (!Ctor) return;
    setError(null);
    setInterim("");
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalCb.current(res[0].transcript.trim());
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === "aborted") return;
      setError(ERROR_TEXT[e.error] ?? `The speech service stopped with an error (${e.error}). Type instead.`);
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("The microphone could not be started. Type instead.");
    }
  };
  const stop = () => rec.current?.stop();

  return (
    <div className="ask-mic">
      <div className={`ask-mic__wrap ${listening ? "ask-mic__wrap--on" : ""}`}>
        <button
          type="button"
          className="ask-mic__btn"
          aria-pressed={listening}
          onClick={listening ? stop : start}
        >
          <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>{listening ? "Stop" : "Start talking"}</span>
        </button>
      </div>
      <div aria-live="polite" className="ask-mic__status">
        {listening && <p><strong>Listening…</strong> {interim && <span className="ask-mic__interim">{interim}</span>}</p>}
        {error && <p className="ask-bad">{error}</p>}
      </div>
      <p className="ask-hint">Speech is turned into text by your browser&rsquo;s own speech service.</p>
    </div>
  );
}
