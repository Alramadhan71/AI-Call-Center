import { createServer } from "node:http";
import { createReadStream, readFileSync, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, "dist");
const staticTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
]);

function loadEnv() {
  if (!existsSync(".env")) return;
  const lines = readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").trim();
    }
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function readBuffer(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > 10_000_000) {
        reject(new Error("Audio file is too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function send(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(payload));
}

function sendAudio(response, status, bytes, mimeType = "audio/wav") {
  response.writeHead(status, {
    "Content-Type": mimeType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(bytes);
}

function sendText(response, status, text, contentType = "text/plain") {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(text);
}

async function serveStatic(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (!existsSync(distDir)) return false;

  const url = new URL(request.url || "/", "http://localhost");
  if (url.pathname.startsWith("/api/") || url.pathname === "/health") return false;

  const requested = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidate = path.join(distDir, requested === "/" ? "index.html" : requested);
  const file = candidate.startsWith(distDir) ? candidate : path.join(distDir, "index.html");
  const target = await stat(file).then((item) => item.isFile() ? file : path.join(distDir, "index.html")).catch(() => path.join(distDir, "index.html"));
  const ext = path.extname(target).toLowerCase();

  response.writeHead(200, {
    "Content-Type": staticTypes.get(ext) || "application/octet-stream",
    "Cache-Control": target.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable",
  });
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  createReadStream(target).pipe(response);
  return true;
}

function wavFromPcm(pcmBytes, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBytes.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBytes.length, 40);
  return Buffer.concat([header, pcmBytes]);
}

loadEnv();

const port = Number(process.env.API_PORT || 8787);
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ttsModel = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const liveModel = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
const openaiTextModel = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
const openaiTtsModel = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const openaiRealtimeModel = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";

function liveSystemInstruction({ dialect = "Saudi Arabic", language = "Arabic and English" } = {}) {
  return [
    "You are a professional realtime voice-only bank call center agent for Muslim Solutions.",
    "Speak only by voice. Do not send chat-style explanations, markdown, lists, or long monologues.",
    "Support Arabic and English naturally. If the customer speaks Arabic, use warm clear Arabic. If the customer speaks English, answer in professional English.",
    `Preferred Arabic dialect: ${dialect}.`,
    `Allowed conversation languages: ${language}.`,
    "Keep every response concise, calm, and human. Ask one question at a time.",
    "For private banking data, never reveal balances, card status, account numbers, or transactions until identity is verified.",
    "Verification flow: ask for the 10-digit National ID, then the 4-digit PIN. Demo valid pairs are National ID 1234567890 with PIN 4321, and National ID 2233445566 with PIN 1122.",
    "If verification fails three times, say you will transfer the customer to a bank employee.",
    "If the customer switches language mid-call, switch with them smoothly.",
  ].join("\n");
}

function openGeminiLiveSocket(setup) {
  const endpoint = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
  const url = `${endpoint}?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const gemini = new WebSocket(url);
  gemini.on("open", () => {
    gemini.send(JSON.stringify({
      setup: {
        model: `models/${liveModel}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          temperature: 0.45,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: setup.voiceName || "Kore",
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: liveSystemInstruction(setup) }],
        },
      },
    }));
  });
  return gemini;
}

const bankingCustomers = [
  {
    id: "cust-1001",
    name: "Abdullah Salem",
    nationalId: "1234567890",
    pin: "4321",
    accountNumber: "SA-001-4581",
    balance: "18,750.40 SAR",
    cardStatus: "Active",
    lastTransactions: [
      "Salary deposit: 12,000 SAR",
      "Grocery payment: 248.90 SAR",
      "Telecom bill: 89 SAR",
    ],
  },
  {
    id: "cust-1002",
    name: "Maha Alharbi",
    nationalId: "2233445566",
    pin: "1122",
    accountNumber: "SA-002-7720",
    balance: "6,420.15 SAR",
    cardStatus: "Active",
    lastTransactions: [
      "ATM withdrawal: 500 SAR",
      "Online purchase: 319 SAR",
      "Transfer received: 1,000 SAR",
    ],
  },
];

const bankingSessions = new Map();

function normalizeDigits(text) {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const eastern = "۰۱۲۳۴۵۶۷۸۹";
  return String(text || "").replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicIndex = arabic.indexOf(digit);
    if (arabicIndex >= 0) return String(arabicIndex);
    return String(eastern.indexOf(digit));
  });
}

function digitsOnly(text) {
  return normalizeDigits(text).replace(/\D/g, "");
}

function safeDigitsOnly(text) {
  return String(text || "")
    .replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) => {
      const code = digit.charCodeAt(0);
      if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
      return String(code - 0x06F0);
    })
    .replace(/\D/g, "");
}

function maskId(id) {
  return `******${id.slice(-4)}`;
}

function getBankingSession(sessionId) {
  if (!bankingSessions.has(sessionId)) {
    bankingSessions.set(sessionId, {
      state: "unverified",
      nationalId: "",
      customerId: "",
      attempts: 0,
    });
  }
  return bankingSessions.get(sessionId);
}

function bankingReplyFor(customer, message) {
  const lower = message.toLowerCase();
  if (/balance|رصيد|الرصيد/.test(lower)) {
    return `Your current balance is ${customer.balance}.`;
  }
  if (/transaction|transactions|عمليات|حركات|معاملات/.test(lower)) {
    return `Your latest transactions are: ${customer.lastTransactions.join("; ")}.`;
  }
  if (/card|بطاقة|البطاقة/.test(lower)) {
    return `Your card status is ${customer.cardStatus}.`;
  }
  if (/account|حساب|الحساب/.test(lower)) {
    return `Your account number is ${customer.accountNumber}, and your balance is ${customer.balance}.`;
  }
  return `You are verified, ${customer.name}. You can ask for your balance, latest transactions, card status, or account number.`;
}

function isArabicResponse(language, message = "") {
  return language === "ar" || (language === "same" && /[\u0600-\u06FF]/.test(message));
}

function bankingReplyForLanguage(customer, message, language = "en") {
  const lower = message.toLowerCase();
  const arabic = isArabicResponse(language, message);
  if (/balance/.test(lower) || message.includes("رصيد")) {
    return arabic ? `رصيدك الحالي هو ${customer.balance}.` : `Your current balance is ${customer.balance}.`;
  }
  if (/transaction|transactions/.test(lower) || message.includes("عمليات") || message.includes("حركات") || message.includes("معاملات")) {
    return arabic ? `آخر العمليات هي: ${customer.lastTransactions.join("؛ ")}.` : `Your latest transactions are: ${customer.lastTransactions.join("; ")}.`;
  }
  if (/card/.test(lower) || message.includes("بطاقة")) {
    return arabic ? `حالة بطاقتك هي: ${customer.cardStatus}.` : `Your card status is ${customer.cardStatus}.`;
  }
  if (/account/.test(lower) || message.includes("حساب")) {
    return arabic ? `رقم حسابك هو ${customer.accountNumber}، ورصيدك هو ${customer.balance}.` : `Your account number is ${customer.accountNumber}, and your balance is ${customer.balance}.`;
  }
  return arabic
    ? `تم التحقق من هويتك يا ${customer.name}. تقدر تسأل عن الرصيد، آخر العمليات، حالة البطاقة، أو رقم الحساب.`
    : `You are verified, ${customer.name}. You can ask for your balance, latest transactions, card status, or account number.`;
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    send(response, 204, {});
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    send(response, 200, {
      ok: true,
      provider: "gemini-live",
      openaiTextModel,
      openaiTtsModel,
      openaiRealtimeModel,
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
      gemini: { model, ttsModel, liveModel, hasKey: Boolean(process.env.GEMINI_API_KEY) },
    });
    return;
  }

  if (await serveStatic(request, response)) {
    return;
  }

  if (request.method === "POST" && request.url === "/api/transcribe") {
    if (!process.env.OPENAI_API_KEY) {
      send(response, 500, { error: "Missing OPENAI_API_KEY. Add it to .env." });
      return;
    }

    try {
      const audio = await readBuffer(request);
      if (!audio.length) {
        send(response, 400, { error: "Missing audio" });
        return;
      }

      const form = new FormData();
      form.set("model", "gpt-4o-mini-transcribe");
      form.set("file", new File([audio], "voice.webm", { type: request.headers["content-type"] || "audio/webm" }));

      const transcriptResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: form,
      });

      const data = await transcriptResponse.json();
      if (!transcriptResponse.ok) {
        send(response, transcriptResponse.status, { error: data.error?.message || "Transcription request failed" });
        return;
      }

      send(response, 200, { text: data.text || "" });
    } catch (error) {
      send(response, 500, { error: error instanceof Error ? error.message : "Unexpected transcription server error" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/banking-turn") {
    try {
      const body = JSON.parse(await readBody(request));
      const sessionId = String(body.sessionId || "default");
      const transcript = String(body.transcript || "").trim();
      const responseLanguage = String(body.responseLanguage || "en");
      const session = getBankingSession(sessionId);
      const digits = safeDigitsOnly(transcript);

      if (!transcript) {
        send(response, 400, { error: "Missing transcript" });
        return;
      }

      if (session.state === "blocked") {
        send(response, 200, {
          reply: isArabicResponse(responseLanguage, transcript) ? "لأمان حسابك، تم قفل جلسة التحقق. سأحولك إلى موظف البنك." : "For security, this verification session is locked. I will transfer you to a bank employee.",
          state: session.state,
          source: "Security handoff",
        });
        return;
      }

      if (session.state === "verified") {
        const customer = bankingCustomers.find((item) => item.id === session.customerId);
        send(response, 200, {
          reply: customer ? bankingReplyForLanguage(customer, transcript, responseLanguage) : (isArabicResponse(responseLanguage, transcript) ? "لم أتمكن من تحميل حسابك. سأحولك إلى موظف البنك." : "I could not load your account. I will transfer you to a bank employee."),
          state: session.state,
          source: "Verified banking data",
          customer: customer ? { name: customer.name, nationalId: maskId(customer.nationalId) } : null,
        });
        return;
      }

      if (session.state === "awaiting_pin") {
        const customer = bankingCustomers.find((item) => item.nationalId === session.nationalId);
        if (customer && digits.endsWith(customer.pin)) {
          session.state = "verified";
          session.customerId = customer.id;
          send(response, 200, {
            reply: isArabicResponse(responseLanguage, transcript)
              ? `شكرا يا ${customer.name}. تم التحقق من هويتك. وش تحب تعرف: الرصيد، آخر العمليات، حالة البطاقة، أو رقم الحساب؟`
              : `Thanks, ${customer.name}. Your identity is verified. What would you like to know: balance, recent transactions, card status, or account number?`,
            state: session.state,
            source: "Verification complete",
            customer: { name: customer.name, nationalId: maskId(customer.nationalId) },
          });
          return;
        }

        session.attempts += 1;
        if (session.attempts >= 3) {
          session.state = "blocked";
          send(response, 200, {
            reply: isArabicResponse(responseLanguage, transcript) ? "تم إدخال الرقم السري بشكل خاطئ ثلاث مرات. لأمان حسابك، سأحولك إلى موظف البنك." : "The PIN was entered incorrectly three times. For your security, I will transfer you to a bank employee.",
            state: session.state,
            source: "Security handoff",
          });
          return;
        }

        send(response, 200, {
          reply: isArabicResponse(responseLanguage, transcript) ? `الرقم السري غير صحيح. فضلا قل الرقم السري المكون من 4 أرقام مرة أخرى. المحاولة ${session.attempts} من 3.` : `The PIN did not match. Please say your 4-digit PIN again. Attempt ${session.attempts} of 3.`,
          state: session.state,
          source: "PIN verification",
        });
        return;
      }

      const nationalId = digits.length >= 10 ? digits.slice(-10) : "";
      const customer = bankingCustomers.find((item) => item.nationalId === nationalId);
      if (customer) {
        session.state = "awaiting_pin";
        session.nationalId = customer.nationalId;
        session.attempts = 0;
        send(response, 200, {
          reply: isArabicResponse(responseLanguage, transcript) ? `وجدت حسابا ينتهي برقم ${customer.nationalId.slice(-4)}. فضلا قل الرقم السري المكون من 4 أرقام للمتابعة.` : `I found an account ending in ${customer.nationalId.slice(-4)}. Please say your 4-digit PIN to continue.`,
          state: session.state,
          source: "National ID verification",
        });
        return;
      }

      session.state = "awaiting_national_id";
      send(response, 200, {
        reply: isArabicResponse(responseLanguage, transcript) ? "لأمان حسابك، فضلا قل رقم الهوية الوطنية المكون من 10 أرقام أولا. لن أشارك أي معلومات عن الحساب قبل التحقق من هويتك." : "For security, please say your 10-digit national ID first. I will not share account information until your identity is verified.",
        state: session.state,
        source: "Verification required",
      });
    } catch (error) {
      send(response, 500, { error: error instanceof Error ? error.message : "Unexpected banking server error" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/realtime-call") {
    if (!process.env.OPENAI_API_KEY) {
      send(response, 500, { error: "Missing OPENAI_API_KEY. Add it to .env." });
      return;
    }

    try {
      const body = JSON.parse(await readBody(request));
      const sdp = String(body.sdp || "");
      const instructions = String(body.instructions || "You are a helpful realtime voice agent.");
      if (!sdp) {
        send(response, 400, { error: "Missing SDP offer" });
        return;
      }

      const sessionConfig = {
        type: "realtime",
        model: openaiRealtimeModel,
        instructions,
        audio: {
          input: {
            transcription: {
              model: "gpt-4o-mini-transcribe",
            },
          },
          output: {
            voice: "marin",
          },
        },
      };

      const form = new FormData();
      form.set("sdp", sdp);
      form.set("session", JSON.stringify(sessionConfig));

      const realtimeResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: form,
      });

      const answer = await realtimeResponse.text();
      if (!realtimeResponse.ok) {
        sendText(response, realtimeResponse.status, answer, "application/json");
        return;
      }

      sendText(response, 200, answer, "application/sdp");
    } catch (error) {
      send(response, 500, { error: error instanceof Error ? error.message : "Unexpected realtime server error" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/openai") {
    if (!process.env.OPENAI_API_KEY) {
      send(response, 500, { error: "Missing OPENAI_API_KEY. Add it to .env." });
      return;
    }

    try {
      const body = JSON.parse(await readBody(request));
      const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: openaiTextModel,
          instructions: body.systemInstruction || "You are a concise AI call center agent.",
          input: body.prompt || "",
          max_output_tokens: 320,
        }),
      });

      const data = await openaiResponse.json();
      if (!openaiResponse.ok) {
        send(response, openaiResponse.status, { error: data.error?.message || "OpenAI request failed" });
        return;
      }

      const text = data.output_text
        || data.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("").trim()
        || "No response returned.";
      send(response, 200, { text, model: openaiTextModel });
    } catch (error) {
      send(response, 500, { error: error instanceof Error ? error.message : "Unexpected OpenAI server error" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/openai-tts") {
    if (!process.env.OPENAI_API_KEY) {
      send(response, 500, { error: "Missing OPENAI_API_KEY. Add it to .env." });
      return;
    }

    try {
      const body = JSON.parse(await readBody(request));
      const text = String(body.text || "").trim();
      if (!text) {
        send(response, 400, { error: "Missing text" });
        return;
      }

      const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: openaiTtsModel,
          voice: "alloy",
          input: text.slice(0, 1600),
          instructions: "Speak naturally like a calm call center agent. If the text is Arabic, use a clear friendly Arabic delivery.",
          response_format: "mp3",
        }),
      });

      if (!ttsResponse.ok) {
        const data = await ttsResponse.json().catch(() => ({}));
        send(response, ttsResponse.status, { error: data.error?.message || "OpenAI TTS request failed" });
        return;
      }

      const audio = Buffer.from(await ttsResponse.arrayBuffer());
      sendAudio(response, 200, audio, "audio/mpeg");
    } catch (error) {
      send(response, 500, { error: error instanceof Error ? error.message : "Unexpected OpenAI TTS server error" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/tts") {
    if (!process.env.GEMINI_API_KEY) {
      send(response, 500, { error: "Missing GEMINI_API_KEY. Create a .env file from .env.example." });
      return;
    }

    try {
      const body = JSON.parse(await readBody(request));
      const text = String(body.text || "").trim();
      if (!text) {
        send(response, 400, { error: "Missing text" });
        return;
      }

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ttsModel)}:generateContent`;
      const ttsResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Say in a warm, natural call center voice. If Arabic, use a clear Saudi Arabic accent. Transcript: ${text}`,
            }],
          }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Kore",
                },
              },
            },
          },
        }),
      });

      const data = await ttsResponse.json();
      if (!ttsResponse.ok) {
        send(response, ttsResponse.status, { error: data.error?.message || "Gemini TTS request failed" });
        return;
      }

      const inline = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      const audioBase64 = inline?.data;
      if (!audioBase64) {
        send(response, 500, { error: "No audio returned from Gemini TTS" });
        return;
      }

      const pcm = Buffer.from(audioBase64, "base64");
      const wav = wavFromPcm(pcm);
      sendAudio(response, 200, wav, "audio/wav");
    } catch (error) {
      send(response, 500, { error: error instanceof Error ? error.message : "Unexpected TTS server error" });
    }
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/gemini") {
    send(response, 404, { error: "Not found" });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    send(response, 500, { error: "Missing GEMINI_API_KEY. Create a .env file from .env.example." });
    return;
  }

  try {
    const body = JSON.parse(await readBody(request));
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: body.systemInstruction || "You are a helpful AI call center agent." }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: body.prompt || "" }],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          topP: 0.9,
          maxOutputTokens: 900,
        },
      }),
    });

    const data = await geminiResponse.json();
    if (!geminiResponse.ok) {
      send(response, geminiResponse.status, { error: data.error?.message || "Gemini request failed" });
      return;
    }

    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    send(response, 200, { text: text || "No response returned.", model });
  } catch (error) {
    send(response, 500, { error: error instanceof Error ? error.message : "Unexpected server error" });
  }
});

const geminiLiveServer = new WebSocketServer({ noServer: true });

geminiLiveServer.on("connection", (client) => {
  if (!process.env.GEMINI_API_KEY) {
    client.send(JSON.stringify({ type: "error", message: "Missing GEMINI_API_KEY. Add a Google AI Studio API key to .env." }));
    client.close(1011, "Missing GEMINI_API_KEY");
    return;
  }

  let gemini = null;
  let upstreamReady = false;
  const pendingAudio = [];

  function sendToClient(payload) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  }

  function forwardAudio(data, mimeType) {
    if (!gemini || gemini.readyState !== WebSocket.OPEN || !upstreamReady) {
      pendingAudio.push({ data, mimeType });
      return;
    }
    gemini.send(JSON.stringify({
      realtimeInput: {
        audio: { data, mimeType },
      },
    }));
  }

  function flushAudio() {
    while (pendingAudio.length && gemini?.readyState === WebSocket.OPEN && upstreamReady) {
      const chunk = pendingAudio.shift();
      forwardAudio(chunk.data, chunk.mimeType);
    }
  }

  client.on("message", (raw) => {
    let event;
    try {
      event = JSON.parse(String(raw));
    } catch {
      sendToClient({ type: "error", message: "Unreadable realtime event." });
      return;
    }

    if (event.type === "setup") {
      if (gemini) return;
      gemini = openGeminiLiveSocket({
        dialect: event.dialect,
        language: event.language,
        voiceName: event.voiceName,
      });

      gemini.on("message", (message) => {
        let data;
        try {
          data = JSON.parse(String(message));
        } catch {
          return;
        }

        if (data.setupComplete) {
          upstreamReady = true;
          sendToClient({ type: "ready", model: liveModel });
          flushAudio();
        }

        if (data.serverContent?.interrupted) {
          sendToClient({ type: "interrupted" });
        }

        const parts = data.serverContent?.modelTurn?.parts || [];
        for (const part of parts) {
          const inlineData = part.inlineData || part.inline_data;
          if (inlineData?.data) {
            sendToClient({
              type: "audio",
              data: inlineData.data,
              mimeType: inlineData.mimeType || inlineData.mime_type || "audio/pcm;rate=24000",
            });
          }
          if (part.text) {
            sendToClient({ type: "notice", message: part.text });
          }
        }

        if (data.serverContent?.generationComplete || data.serverContent?.turnComplete) {
          sendToClient({ type: "turnComplete" });
        }

        if (data.error) {
          sendToClient({ type: "error", message: data.error.message || "Gemini Live error." });
        }
      });

      gemini.on("close", (_code, reason) => {
        sendToClient({ type: "closed", message: reason?.toString() || "Gemini Live session closed." });
        if (client.readyState === WebSocket.OPEN) client.close();
      });

      gemini.on("error", (error) => {
        sendToClient({ type: "error", message: error instanceof Error ? error.message : "Gemini Live connection failed." });
      });
      return;
    }

    if (event.type === "audio" && event.data) {
      forwardAudio(event.data, event.mimeType || "audio/pcm;rate=48000");
    }
  });

  client.on("close", () => {
    if (gemini?.readyState === WebSocket.OPEN || gemini?.readyState === WebSocket.CONNECTING) {
      gemini.close();
    }
  });
});

server.on("upgrade", (request, socket, head) => {
  if (request.url === "/api/gemini-live") {
    geminiLiveServer.handleUpgrade(request, socket, head, (ws) => {
      geminiLiveServer.emit("connection", ws, request);
    });
    return;
  }
  socket.destroy();
});

server.listen(port, () => {
  console.log(`Gemini proxy listening on http://localhost:${port}`);
});
