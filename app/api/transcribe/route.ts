import { NextRequest } from "next/server";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import {
  cutMp3Segment,
  extractAudioToMp3,
  getDurationSeconds,
  toWhisperFloat32,
} from "@/lib/ffmpeg";
import { transcribeChunk } from "@/lib/whisper";

export const runtime = "nodejs";
// Vídeos longos geram várias transcrições sequenciais — isso pode levar
// alguns minutos. No plano gratuito da Vercel as funções são limitadas a
// 60s; para vídeos de vários blocos de 10 min é necessário o plano Pro
// (até 800s com "Fluid Compute") ou rodar este mesmo código localmente.
export const maxDuration = 800;

const CHUNK_SECONDS = 10 * 60; // no máximo 10 minutos de áudio por corte

function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type ProgressEvent =
  | { type: "status"; message: string }
  | {
      type: "chunk";
      index: number;
      totalChunks: number;
      startSec: number;
      endSec: number;
      text: string;
      reinforcedSeconds: number;
    }
  | { type: "done"; fullText: string }
  | { type: "error"; message: string };

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      let workDir: string | null = null;
      try {
        const form = await req.formData();
        const file = form.get("video");
        if (!file || !(file instanceof Blob)) {
          send({ type: "error", message: "Nenhum vídeo enviado." });
          controller.close();
          return;
        }

        workDir = await mkdtemp(path.join(tmpdir(), "transcricao-"));
        const videoPath = path.join(workDir, "video_original");
        await writeFile(videoPath, Buffer.from(await file.arrayBuffer()));

        send({ type: "status", message: "Extraindo áudio do vídeo (mp3)..." });
        const mp3Path = path.join(workDir, "audio_completo.mp3");
        await extractAudioToMp3(videoPath, mp3Path);

        const totalSeconds = await getDurationSeconds(mp3Path);
        const totalChunks = Math.max(1, Math.ceil(totalSeconds / CHUNK_SECONDS));

        send({
          type: "status",
          message: `Áudio extraído (${formatTime(totalSeconds)}). Dividindo em ${totalChunks} bloco(s) de até 10 min.`,
        });

        const fullTextParts: string[] = [];

        for (let i = 0; i < totalChunks; i++) {
          const startSec = i * CHUNK_SECONDS;
          const durationSec = Math.min(CHUNK_SECONDS, totalSeconds - startSec);
          const endSec = startSec + durationSec;

          send({
            type: "status",
            message: `Transcrevendo bloco ${i + 1} de ${totalChunks} (${formatTime(startSec)}–${formatTime(endSec)})...`,
          });

          const segmentPath = path.join(workDir, `bloco_${i + 1}.mp3`);
          await cutMp3Segment(mp3Path, segmentPath, startSec, durationSec);

          const floatAudio = await toWhisperFloat32(segmentPath);
          const { text, reinforcedSeconds } = await transcribeChunk(floatAudio);

          fullTextParts.push(text);
          send({
            type: "chunk",
            index: i + 1,
            totalChunks,
            startSec,
            endSec,
            text,
            reinforcedSeconds,
          });

          await rm(segmentPath, { force: true });
        }

        send({ type: "done", fullText: fullTextParts.join("\n\n") });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Erro desconhecido na transcrição.",
        });
      } finally {
        if (workDir) {
          await rm(workDir, { recursive: true, force: true }).catch(() => {});
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}
