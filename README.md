# Transcritor de Vídeo

App Next.js que transcreve um vídeo completo:

1. Extrai o áudio do vídeo e salva como mp3.
2. Divide o áudio em blocos de **no máximo 10 minutos**.
3. Transcreve cada bloco, **um por vez**, usando Whisper rodando
   localmente (sem chamada de API, sem custo por uso).
4. Mostra o texto de cada bloco na tela conforme fica pronto (não precisa
   esperar o vídeo inteiro terminar para começar a ler).

## Como rodar

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`, escolha um vídeo e clique em "Transcrever".

Na primeira transcrição, o modelo Whisper (uns ~150 MB) é baixado
automaticamente do Hugging Face e fica em cache local — as próximas
chamadas já usam o modelo baixado, sem precisar baixar de novo.

## Como ajustar

- **Modelo usado**: em `lib/whisper.ts`, a constante `MODEL_ID`
  (`Xenova/whisper-base` por padrão). Para mais velocidade, troque para
  `Xenova/whisper-tiny`; para mais qualidade (porém mais lento),
  `Xenova/whisper-small`.
- **Tamanho do bloco**: em `app/api/transcribe/route.ts`, a constante
  `CHUNK_SECONDS` (600 = 10 minutos).

## Publicando na Vercel — ponto de atenção importante

Rodar Whisper localmente (sem API paga) significa processamento pesado de
CPU, e isso tem um atrito real com funções serverless da Vercel:

- **Tempo de execução**: cada bloco de 10 min pode levar de alguns
  segundos a 1-2 minutos para transcrever, dependendo do modelo e da CPU.
  Um vídeo de 1h = 6 blocos processados em sequência numa única
  requisição. No plano **Hobby** (grátis) da Vercel, funções são limitadas
  a 60s — **isso não é suficiente** para vídeos de mais de ~1 bloco. Para
  vídeos mais longos, é necessário o plano **Pro** (configurei
  `maxDuration = 800` no código, que exige Pro/Fluid Compute).
- **Download do modelo a cada "cold start"**: funções serverless não
  garantem que o disco fique persistente entre execuções. Isso pode fazer
  o modelo ser baixado de novo em alguns acessos, deixando a primeira
  transcrição de cada "sessão fria" mais lenta.
- **Alternativa mais robusta**: se os vídeos forem longos ou o uso for
  frequente, considere rodar este mesmo projeto como um processo Node
  sempre ativo (`npm run build && npm run start`) numa VPS simples, em vez
  da Vercel — aí não há limite de tempo de execução nem esse problema de
  cache. O código é o mesmo, só muda onde ele roda.

## Testado neste ambiente

Validei a extração de áudio, a divisão em blocos e a conversão para o
formato que o Whisper espera (16kHz mono) com um vídeo de teste — tudo
funcionando. A chamada real ao modelo Whisper (que baixa os pesos do
Hugging Face) não pôde ser testada aqui porque este ambiente de
desenvolvimento não tem acesso à internet para esse domínio — mas vai
funcionar normalmente no seu computador ou na Vercel, que têm acesso
irrestrito.
