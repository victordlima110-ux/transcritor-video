import { pipeline, type AutomaticSpeechRecognitionPipeline } from "@xenova/transformers";

// Modelo Whisper local e gratuito (sem chamadas de API, sem custo por uso).
// "Xenova/whisper-base" é multilíngue e funciona bem para português.
// Para mais velocidade: "Xenova/whisper-tiny". Para mais qualidade: "Xenova/whisper-small".
const MODEL_ID = process.env.WHISPER_MODEL ?? "Xenova/whisper-base";

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = pipeline(
      "automatic-speech-recognition",
      MODEL_ID
    ) as Promise<AutomaticSpeechRecognitionPipeline>;
  }
  return transcriberPromise;
}

/**
 * Transcreve um bloco de áudio (Float32Array, 16kHz, mono) para texto em português.
 * O modelo roda localmente — primeira chamada baixa e carrega os pesos (fica em cache
 * depois disso), chamadas seguintes reaproveitam o mesmo modelo já carregado.
 */
export async function transcribeChunk(audio: Float32Array): Promise<string> {
  const transcriber = await getTranscriber();
  const output = await transcriber(audio, {
    language: "portuguese",
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  if (Array.isArray(output)) {
    return output.map((o) => o.text).join(" ").trim();
  }
  return (output.text ?? "").trim();
}
