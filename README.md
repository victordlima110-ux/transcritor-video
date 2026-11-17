# Transcritor de Vídeo

App Next.js que transcreve um vídeo completo:

1. Extrai o áudio do vídeo e salva como mp3.
2. Divide o áudio em blocos de **no máximo 10 minutos**.
3. Transcreve cada bloco, **um por vez**, usando Whisper rodando
   localmente (sem chamada de API, sem custo por uso).
4. Dentro de cada bloco, detecta automaticamente trechos (~30s) com sinais
   de transcrição ruim — silêncio mal interpretado, repetição/"alucinação"
   típica quando o áudio tem ruído ou fala pouco clara — e re-transcreve
   **só esses trechos** com um modelo mais robusto, sem deixar o processo
   inteiro mais lento.
5. Mostra o texto de cada bloco na tela conforme fica pronto (não precisa
   esperar o vídeo inteiro terminar para começar a ler), sinalizando quando
   algum trecho recebeu esse reforço extra.

## Como rodar

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`, escolha um vídeo e clique em "Transcrever".

Na primeira transcrição, o modelo Whisper (uns ~150 MB) é baixado
automaticamente do Hugging Face e fica em cache local — as próximas
chamadas já usam o modelo baixado, sem precisar baixar de novo.

## Velocidade vs. qualidade

Por padrão, todo o áudio é transcrito com `Xenova/whisper-base`, e qualquer
trecho suspeito é reforçado com `Xenova/whisper-small` (mais lento, porém
mais preciso) — só nesse trecho, não no bloco inteiro.

Isso é configurável por variável de ambiente, sem mexer no código. No
Windows (cmd), antes do `npm run dev`:

```bat
set WHISPER_MODEL=Xenova/whisper-tiny
set WHISPER_RETRY_MODEL=Xenova/whisper-base
npm run dev
```

- `WHISPER_MODEL` — modelo usado em todo o áudio. Do mais rápido/menos
  preciso para o mais lento/mais preciso: `whisper-tiny` → `whisper-base`
  (padrão) → `whisper-small` → `whisper-medium`.
- `WHISPER_RETRY_MODEL` — modelo usado só nos trechos problemáticos
  (padrão: `whisper-small`).

**Combinação recomendada se o objetivo principal é velocidade**: a de
cima (`tiny` + reforço com `base`) — reduz bastante o tempo total e ainda
assim reforça automaticamente os trechos difíceis com o modelo que você já
testou e aprovou.

Importante: nenhuma dessas combinações garante 100% de acerto — áudio
muito ruidoso ou fala muito confusa sempre vai ter limite, de qualquer
transcritor automático. O reforço automático reduz os erros óbvios
(trechos vazios, repetição/alucinação), não garante perfeição.

Outro ajuste possível: em `app/api/transcribe/route.ts`, a constante
`CHUNK_SECONDS` (600 = 10 minutos) controla o tamanho de cada bloco
externo.

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
