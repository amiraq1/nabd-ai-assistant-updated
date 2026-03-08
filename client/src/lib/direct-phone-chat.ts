const PHONE_API_BASE_STORAGE_KEY = "nabd:phoneApiBase";
const PHONE_MODEL_STORAGE_KEY = "nabd:phoneModel";
const UNCERTAIN_PREFIX = "غير متأكد:";

const FACTUAL_PROMPT_HINTS = [
  /(^|\s)(where|what is|who is|when|which|capital|population|history|city|country|province)(\s|$)/i,
  /(اين|أين|ما هي|من هو|من هي|متى|كم|اين تقع|أين تقع|عاصمة|محافظة|مدينة|دولة|تاريخ|عدد السكان|معلومات)/i,
];

const FACTUAL_RESPONSE_HINTS = [
  /\b(capital|province|country|city|largest|century|population|located)\b/i,
  /(محافظة|عاصمة|مدينة|دولة|تقع|عدد السكان|أكبر|القرن|تبعد|كم|تشتهر)/i,
  /\b\d{2,}\b/,
];

const HEDGING_HINTS = [
  /\b(i don't know|i am not sure|not certain|maybe|possibly|unclear)\b/i,
  /(لا أعرف|غير متأكد|لست متأكدًا|لست متأكدا|ربما|قد يكون|غير واضح)/i,
];

const SUSPICIOUS_META_HINTS = [
  /\bhere'?s the correct way to write the question\b/i,
  /\bthe question is asking\b/i,
  /\bthe answer\b/i,
  /(السؤال|الجواب)\s*:/i,
  /لا تخترع حقائق/i,
  /إذا لم تكن واثق/i,
];

export type PhoneReplyConfidence = "high" | "medium" | "low";

export interface DirectPhoneReply {
  answer: string;
  confidence: PhoneReplyConfidence;
  shouldWarn: boolean;
  factualPrompt: boolean;
  rawText: string;
}

function readRuntimeSetting(queryKey: string, storageKey: string): string {
  if (typeof window === "undefined") return "";

  const queryValue = new URLSearchParams(window.location.search).get(queryKey)?.trim() ?? "";
  if (queryValue) {
    window.localStorage.setItem(storageKey, queryValue);
    return queryValue;
  }

  return window.localStorage.getItem(storageKey)?.trim() ?? "";
}

const RAW_PHONE_API_BASE =
  readRuntimeSetting("phoneApiBase", PHONE_API_BASE_STORAGE_KEY) ||
  (import.meta.env.VITE_PHONE_API_BASE ?? "").trim();

const RAW_PHONE_MODEL =
  readRuntimeSetting("phoneModel", PHONE_MODEL_STORAGE_KEY) ||
  (import.meta.env.VITE_PHONE_MODEL ?? "tinyllama").trim();

export const DIRECT_PHONE_MODE_ENABLED = RAW_PHONE_API_BASE.length > 0;
export const DIRECT_PHONE_MODEL_NAME = RAW_PHONE_MODEL || "tinyllama";

function isLikelyFactualPrompt(prompt: string): boolean {
  const normalizedPrompt = prompt.trim();
  return FACTUAL_PROMPT_HINTS.some((pattern) => pattern.test(normalizedPrompt));
}

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function buildGuardedPrompt(prompt: string, factualPrompt: boolean): string {
  const instructions = [
    "أجب بالعربية باختصار.",
    "لا تخترع حقائق أو أسماء أماكن أو أرقام أو تواريخ.",
    factualPrompt
      ? `إذا لم تكن واثقًا من المعلومة الواقعية فابدأ الجواب بهذه العبارة حرفيًا: ${UNCERTAIN_PREFIX}`
      : `إذا لم تكن واثقًا فابدأ الجواب بهذه العبارة حرفيًا: ${UNCERTAIN_PREFIX}`,
    "إذا كنت واثقًا فأجب بجملة أو جملتين فقط.",
    "",
    `السؤال: ${prompt.trim()}`,
    "الجواب:",
  ];

  return instructions.join("\n");
}

function extractAnswer(rawText: string): string {
  const trimmed = rawText.trim();
  const answerMarkers = ["الجواب:", "Answer:", "answer:"];

  for (const marker of answerMarkers) {
    const lastIndex = trimmed.lastIndexOf(marker);
    if (lastIndex !== -1) {
      const extracted = trimmed.slice(lastIndex + marker.length).trim();
      if (extracted) {
        return extracted;
      }
    }
  }

  return trimmed;
}

function inferConfidence(
  answer: string,
  factualPrompt: boolean,
): PhoneReplyConfidence {
  if (answer.startsWith(UNCERTAIN_PREFIX) || HEDGING_HINTS.some((pattern) => pattern.test(answer))) {
    return "low";
  }

  if (factualPrompt && FACTUAL_RESPONSE_HINTS.some((pattern) => pattern.test(answer))) {
    return "medium";
  }

  return "high";
}

function isSuspiciousAnswer(answer: string, prompt: string): boolean {
  const trimmed = answer.trim();
  if (!trimmed) return true;

  if (SUSPICIOUS_META_HINTS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  if (containsArabic(prompt) && !containsArabic(trimmed) && /[A-Za-z]/.test(trimmed)) {
    return true;
  }

  return false;
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim() || response.statusText;
  } catch {
    return response.statusText;
  }
}

export function formatDirectPhoneReplyForDisplay(reply: DirectPhoneReply): string {
  if (!reply.shouldWarn) {
    return reply.answer;
  }

  const warning =
    reply.confidence === "low"
      ? "تنبيه دقة: النموذج لم يكن واثقًا من هذه المعلومة، لذا لا تعتمدها دون تحقق."
      : "تنبيه دقة: هذه إجابة واقعية من نموذج محلي صغير، فتحقق منها قبل اعتمادها.";

  return `${warning}\n\n${reply.answer}`;
}

export async function requestDirectPhoneReply(prompt: string): Promise<DirectPhoneReply> {
  const factualPrompt = isLikelyFactualPrompt(prompt);
  const guardedPrompt = buildGuardedPrompt(prompt, factualPrompt);

  const response = await fetch("/api/direct-phone/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      baseUrl: RAW_PHONE_API_BASE,
      model: DIRECT_PHONE_MODEL_NAME,
      prompt: guardedPrompt,
    }),
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(`${response.status} ${body}`);
  }

  const data = (await response.json()) as { response?: unknown };
  const rawText = typeof data.response === "string" ? data.response.trim() : "";

  if (!rawText) {
    throw new Error("Phone model returned an empty response");
  }

  const answer = extractAnswer(rawText);
  if (isSuspiciousAnswer(answer, prompt)) {
    return {
      answer: `${UNCERTAIN_PREFIX} النموذج لم يقدم جوابًا موثوقًا لهذا السؤال. حاول إعادة الصياغة أو تحقق من مصدر آخر.`,
      confidence: "low",
      shouldWarn: true,
      factualPrompt,
      rawText,
    };
  }

  const confidence = inferConfidence(answer, factualPrompt);

  return {
    answer,
    confidence,
    shouldWarn: factualPrompt && confidence !== "high",
    factualPrompt,
    rawText,
  };
}
