"use client";

import { useRef, useState } from "react";

type Bloco = {
  index: number;
  totalChunks: number;
  startSec: number;
  endSec: number;
  text: string;
};

function formatMin(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Home() {
  const [status, setStatus] = useState<string>("");
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [erro, setErro] = useState<string>("");
  const [processando, setProcessando] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setBlocos([]);
    setErro("");
    setStatus("Enviando vídeo...");
    setProcessando(true);

    try {
      const formData = new FormData();
      formData.append("video", file);

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.body) throw new Error("Sem resposta do servidor.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;

          const event = JSON.parse(line);
          if (event.type === "status") {
            setStatus(event.message);
          } else if (event.type === "chunk") {
            setBlocos((prev) => [...prev, event]);
          } else if (event.type === "done") {
            setStatus("Transcrição completa.");
          } else if (event.type === "error") {
            setErro(event.message);
          }
        }
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setProcessando(false);
    }
  }

  const textoCompleto = blocos.map((b) => b.text).join("\n\n");

  function baixarTxt() {
    const blob = new Blob([textoCompleto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName.replace(/\.[^.]+$/, "") || "transcricao"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Transcritor de Vídeo</h1>
          <p className="text-slate-400 text-sm">
            Envie um vídeo. O áudio é extraído e dividido em blocos de até 10
            minutos, transcritos um por vez localmente (sem custo de API).
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="video/*,audio/*"
            className="block w-full text-sm text-slate-300 border border-slate-700 rounded-lg p-3 bg-slate-900"
          />
          <button
            type="submit"
            disabled={processando}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2 transition"
          >
            {processando ? "Processando..." : "Transcrever"}
          </button>
        </form>

        {status && <p className="text-sm text-slate-400">{status}</p>}
        {erro && <p className="text-sm text-red-400">Erro: {erro}</p>}

        {blocos.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Transcrição</h2>
              <button
                onClick={baixarTxt}
                className="text-sm bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-1.5"
              >
                Baixar .txt
              </button>
            </div>
            <div className="space-y-4">
              {blocos.map((b) => (
                <div
                  key={b.index}
                  className="border border-slate-800 rounded-lg p-4 bg-slate-900/60"
                >
                  <div className="text-xs text-slate-500 mb-1">
                    Bloco {b.index}/{b.totalChunks} · {formatMin(b.startSec)}–
                    {formatMin(b.endSec)}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {b.text}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
