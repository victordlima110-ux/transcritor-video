import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import ffprobePath from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";

ffmpeg.setFfmpegPath(ffmpegPath.path);
ffmpeg.setFfprobePath(ffprobePath.path);

/** Duração do áudio/vídeo em segundos. */
export function getDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const duration = data?.format?.duration;
      if (!duration) return reject(new Error("Não foi possível ler a duração do arquivo."));
      resolve(duration);
    });
  });
}

/** Extrai a trilha de áudio completa do vídeo e salva como mp3. */
export function extractAudioToMp3(inputPath: string, outputMp3Path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .format("mp3")
      .on("error", reject)
      .on("end", () => resolve())
      .save(outputMp3Path);
  });
}

/**
 * Corta um trecho do mp3 (startSec até startSec+durationSec) e salva
 * como um novo mp3 — um "bloco" de até 10 minutos.
 */
export function cutMp3Segment(
  inputMp3Path: string,
  outputPath: string,
  startSec: number,
  durationSec: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputMp3Path)
      .setStartTime(startSec)
      .setDuration(durationSec)
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .format("mp3")
      .on("error", reject)
      .on("end", () => resolve())
      .save(outputPath);
  });
}

/**
 * Converte um trecho de áudio para PCM float32, 16kHz, mono —
 * formato que o modelo Whisper (transformers.js) espera como entrada.
 * Retorna o Float32Array já pronto para a transcrição.
 */
export function toWhisperFloat32(inputPath: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .format("f32le")
      .on("error", reject)
      .on("end", () => {
        const raw = Buffer.concat(chunks);
        const floatArray = new Float32Array(
          raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
        );
        resolve(floatArray);
      })
      .pipe()
      .on("data", (chunk: Buffer) => chunks.push(chunk));
  });
}
