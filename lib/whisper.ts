import { pipeline, type AutomaticSpeechRecognitionPipeline } from "@xenova/transformers";

// Modelo Whisper local e gratuito (sem chamadas de API, sem custo por uso).
// Quanto menor o modelo, mais rápido — e menos preciso.
//
// Para mudar, defina as variáveis de ambiente antes de rodar (ex: no Windows,
// "set WHISPER_MODEL=Xenova/whisper-tiny" antes do npm run dev):
//   WHISPER_MODEL        — modelo usado em todo o áudio (padrão: whisper-base)
//   WHISPER_RETRY_MODEL  — modelo mais robusto, usado só nos trechos problemáticos
//                           (padrão: whisper-small)
//
// Combinação recomendada se o objetivo é velocidade: WHISPER_MODEL=Xenova/whisper-tiny
// (bem mais rápido) + o reforço automático abaixo continua usando o whisper-base
// (ou o que você definir em WHISPER_RETRY_MODEL) exatamente nos trechos difíceis.
const PRIMARY_MODEL = process.env.WHISPER_MODEL ?? "Xenova/whisper-base";
const RETRY_MODEL = process.env.WHISPER_RETRY_MODEL ?? "Xenova/whisper-small";
const SAMPLE_RATE = 16000;

const transcriberCache = new Map<string, Promise<AutomaticSpeechRecognitionPipeline>>();

function getTranscriber(modelId: string) {
  let cached = transcriberCache.get(modelId);
  if (!cached) {
    cached = pipeline(
      "automatic-speech-recognition",
      modelId
    ) as Promise<AutomaticSpeechRecognitionPipeline>;
    transcriberCache.set(modelId, cached);
  }
  return cached;
}

type WhisperSegment = { text: string; timestamp: [number, number | null] };

async function runModel(modelId: string, audio: Float32Array): Promise<WhisperSegment[]> {
  const transcriber = await getTranscriber(modelId);
  const output: any = await transcriber(audio, {
    language: "portuguese",
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  });

  if (Array.isArray(output?.chunks) && output.chunks.length > 0) {
    return output.chunks as WhisperSegment[];
  }
  // Fallback caso o modelo/versão não devolva "chunks" detalhados.
  return [
    {
      text: output?.text ?? "",
      timestamp: [0, audio.length / SAMPLE_RATE],
    },
  ];
}

/**
 * Sinais de transcrição problemática num trecho:
 * - silêncio/ruído que devia ter texto mas saiu vazio;
 * - repetição da mesma palavra várias vezes seguidas (alucinação clássica
 *   do Whisper quando o áudio está ruidoso ou pouco claro);
 * - texto denso demais para a duração (sintoma do mesmo problema).
 * Nenhum desses sinais é perfeito, mas pega a maioria dos casos óbvios.
 */
function isSuspicious(text: string, durationSec: number): boolean {
  const clean = text.trim();
  if (durationSec > 2 && clean.length === 0) return true;

  const words = clean.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 6) {
    let run = 1;
    let maxRun = 1;
    for (let i = 1; i < words.length; i++) {
      if (words[i] === words[i - 1]) {
        run++;
        maxRun = Math.max(maxRun, run);
      } else {
        run = 1;
      }
    }
    if (maxRun >= 3) return true;
  }

  const charsPerSec = clean.length / Math.max(durationSec, 0.1);
  if (charsPerSec > 25) return true;

  return false;
}

export type TranscribeResult = {
  text: string;
  /** Quantos segundos do bloco precisaram de reforço (modelo mais robusto). */
  reinforcedSeconds: number;
};

/**
 * Transcreve um bloco de áudio (Float32Array, 16kHz, mono) para texto em português.
 * Usa o modelo rápido/padrão primeiro; qualquer trecho interno (~30s) com sinais
 * de transcrição ruim é automaticamente re-transcrito com um modelo mais robusto —
 * só aquele trecho, não o bloco inteiro — mantendo o processo rápido na maior
 * parte do tempo e mais cuidadoso exatamente onde o áudio é difícil.
 */
export async function transcribeChunk(audio: Float32Array): Promise<TranscribeResult> {
  const segments = await runModel(PRIMARY_MODEL, audio);

  const finalTexts: string[] = [];
  let reinforcedSeconds = 0;

  for (const segment of segments) {
    const [start, endRaw] = segment.timestamp;
    const end = endRaw ?? audio.length / SAMPLE_RATE;
    const duration = Math.max(end - start, 0);

    if (isSuspicious(segment.text, duration)) {
      const padding = 0.5; // pequena margem para não cortar palavra na borda
      const startSample = Math.max(0, Math.floor((start - padding) * SAMPLE_RATE));
      const endSample = Math.min(audio.length, Math.ceil((end + padding) * SAMPLE_RATE));
      const slice = audio.slice(startSample, endSample);

      try {
        const retrySegments = await runModel(RETRY_MODEL, slice);
        const retryText = retrySegments.map((s) => s.text).join(" ").trim();
        finalTexts.push(retryText || segment.text.trim());
        reinforcedSeconds += duration;
      } catch {
        // Se o modelo de reforço falhar por qualquer motivo, mantém o texto original.
        finalTexts.push(segment.text.trim());
      }
    } else {
      finalTexts.push(segment.text.trim());
    }
  }

  return {
    text: finalTexts.join(" ").trim(),
    reinforcedSeconds,
  };
}
