import { prisma } from '../config/db';
import { AuthUser } from '../middleware/auth';
import { AppError } from '../utils/errors';
import { listBalances } from '../services/stock.service';
import { openOrGetSession } from '../services/session.service';

export interface ParsedCommand {
  wakeWord: boolean;
  intent:
    | 'stock_in'
    | 'stock_out'
    | 'read_stock'
    | 'show_outstanding'
    | 'complete'
    | 'save'
    | 'edit'
    | 'cancel'
    | 'confirm'
    | 'help'
    | 'unknown';
  employeeName?: string;
  employeeId?: string;
  itemName?: string;
  itemId?: string;
  quantity?: number;
  confidence: number;
  raw: string;
  previewText: string;
}

const WAKE = /^(ashok|అశోక్|अशोक|അശോക്|ಅಶೋಕ್|அசோக்|ଅଶୋକ|अशोक)\s*/i;

const ACTION_MAP: Array<{ re: RegExp; intent: ParsedCommand['intent'] }> = [
  { re: /\b(stock[\s-]?in|return|వస్తువులు తిరిగి|वापसी)\b/i, intent: 'stock_in' },
  { re: /\b(stock[\s-]?out|issue|జారీ|जारी)\b/i, intent: 'stock_out' },
  { re: /\b(read|show|today'?s?\s+stock|స్టాక్|स्टॉक)\b/i, intent: 'read_stock' },
  { re: /\b(outstanding|balance|బాకీ|बाकी)\b/i, intent: 'show_outstanding' },
  { re: /\b(complete|finish|పూర్తి|पूरा)\b/i, intent: 'complete' },
  { re: /\b(save|confirm\s+save|సేవ్|सेव)\b/i, intent: 'save' },
  { re: /\b(edit|change|మార్చు|बदलो)\b/i, intent: 'edit' },
  { re: /\b(cancel|discard|రద్దు|रद्द)\b/i, intent: 'cancel' },
  { re: /\b(confirm|yes|ok|సరే|हाँ)\b/i, intent: 'confirm' },
  { re: /\b(help|సహాయం|मदद)\b/i, intent: 'help' },
];

export function parseVoiceCommand(transcript: string): ParsedCommand {
  const raw = transcript.trim();
  const wakeWord = WAKE.test(raw);
  const body = raw.replace(WAKE, '').trim();

  if (!wakeWord) {
    return {
      wakeWord: false,
      intent: 'unknown',
      confidence: 0,
      raw,
      previewText: 'Waiting for wake word: Ashok.',
    };
  }

  let intent: ParsedCommand['intent'] = 'unknown';
  for (const a of ACTION_MAP) {
    if (a.re.test(body)) {
      intent = a.intent;
      break;
    }
  }

  const qtyMatch = body.match(/(\d+(?:\.\d+)?)/);
  const quantity = qtyMatch ? parseFloat(qtyMatch[1]) : undefined;

  // Naive name/item extraction: words between wake and action/number
  const tokens = body.split(/\s+/).filter(Boolean);

  return {
    wakeWord: true,
    intent,
    quantity,
    confidence: intent === 'unknown' ? 0.3 : 0.75,
    raw,
    previewText: body || raw,
    employeeName: tokens[0],
    itemName: tokens.length > 1 ? tokens[1] : undefined,
  };
}

export async function resolveCommand(parsed: ParsedCommand, actor: AuthUser) {
  if (!parsed.wakeWord) return { parsed, action: null };

  const branchId = actor.role === 'MAIN_ADMIN' ? undefined : actor.branchId ?? undefined;

  if (parsed.intent === 'read_stock') {
    if (!branchId && actor.role === 'SUB_ADMIN') throw new AppError('Branch required', 403);
    const targetBranch =
      branchId ||
      (await prisma.branch.findFirst({ where: { isMain: true } }))?.id;
    if (!targetBranch) throw new AppError('No branch');
    const balances = await listBalances(targetBranch);
    // Enforce: sub never sees other branches — already scoped
    return {
      parsed,
      action: {
        type: 'read_stock',
        requiresConfirm: false,
        data: balances.map((b) => ({
          item: b.item.name,
          qty: b.quantity,
          unit: b.item.unit,
        })),
        speak: `Current stock: ${balances
          .slice(0, 8)
          .map((b) => `${b.item.name} ${b.quantity}`)
          .join(', ')}`,
      },
    };
  }

  if (parsed.intent === 'show_outstanding' && parsed.employeeName) {
    const emp = await prisma.employee.findFirst({
      where: {
        fullName: { contains: parsed.employeeName },
        deletedAt: null,
        ...(actor.role === 'SUB_ADMIN' ? { branchId: actor.branchId! } : {}),
      },
    });
    if (!emp) {
      return {
        parsed,
        action: {
          type: 'error',
          requiresConfirm: false,
          speak: `I could not find employee ${parsed.employeeName}`,
        },
      };
    }
    // Sub-branch isolation
    if (actor.role === 'SUB_ADMIN' && emp.branchId !== actor.branchId) {
      throw new AppError('Access denied', 403);
    }
    return {
      parsed: { ...parsed, employeeId: emp.id },
      action: {
        type: 'show_outstanding',
        requiresConfirm: false,
        data: { employee: emp.fullName, outstanding: emp.outstanding, credit: emp.creditBalance },
        speak: `${emp.fullName} outstanding is ${emp.outstanding} rupees`,
      },
    };
  }

  if (
    (parsed.intent === 'stock_in' || parsed.intent === 'stock_out') &&
    parsed.employeeName &&
    parsed.quantity != null
  ) {
    const emp = await prisma.employee.findFirst({
      where: {
        fullName: { contains: parsed.employeeName },
        deletedAt: null,
        status: 'active',
        ...(actor.role === 'SUB_ADMIN' ? { branchId: actor.branchId! } : {}),
      },
    });
    if (!emp) {
      return {
        parsed,
        action: {
          type: 'error',
          requiresConfirm: false,
          speak: `I could not find employee ${parsed.employeeName}`,
        },
      };
    }

    let item = null;
    if (parsed.itemName) {
      item = await prisma.item.findFirst({
        where: {
          OR: [
            { name: { contains: parsed.itemName } },
            { code: { contains: parsed.itemName.toUpperCase() } },
          ],
          isActive: true,
          deletedAt: null,
        },
      });
    }

    const session = await openOrGetSession(emp.id, actor);

    await prisma.voiceEntry.create({
      data: {
        sessionId: session.id,
        userId: actor.id,
        branchId: emp.branchId,
        transcript: parsed.raw,
        parsedJson: JSON.stringify(parsed),
        status: 'draft',
        actionType: parsed.intent,
      },
    });

    return {
      parsed: {
        ...parsed,
        employeeId: emp.id,
        itemId: item?.id,
        itemName: item?.name ?? parsed.itemName,
      },
      action: {
        type: 'draft_entry',
        requiresConfirm: true,
        sensitive: false,
        draft: {
          employeeId: emp.id,
          employeeName: emp.fullName,
          itemId: item?.id,
          itemName: item?.name ?? parsed.itemName,
          action: parsed.intent,
          quantity: parsed.quantity,
          sessionId: session.id,
          status: 'Draft, not yet saved',
        },
        speak: `I found employee ${emp.fullName}. I entered ${item?.name ?? parsed.itemName} ${
          parsed.intent === 'stock_in' ? 'stock-in' : 'stock-out'
        } quantity ${parsed.quantity} as a draft. Please say confirm, save, edit, or cancel.`,
      },
    };
  }

  if (parsed.intent === 'help') {
    return {
      parsed,
      action: {
        type: 'help',
        requiresConfirm: false,
        speak:
          'Say Ashok, then employee name, item, stock-in or stock-out, and quantity. Say Ashok complete name to review. Then say save, edit, or cancel.',
      },
    };
  }

  return {
    parsed,
    action: {
      type: 'unknown',
      requiresConfirm: false,
      speak: 'I did not understand. Please try again or use Help.',
    },
  };
}

export async function ashokChat(
  message: string,
  actor: AuthUser,
  language = 'en'
): Promise<{ reply: string; data?: unknown }> {
  const lower = message.toLowerCase();

  if (lower.includes('stock') || lower.includes('స్టాక్') || lower.includes('स्टॉक')) {
    const branchId =
      actor.branchId ||
      (await prisma.branch.findFirst({ where: { isMain: true } }))?.id;
    if (!branchId) return { reply: 'No branch configured.' };
    if (actor.role === 'SUB_ADMIN' && actor.branchId !== branchId) {
      return { reply: 'You can only view your own branch stock.' };
    }
    const balances = await listBalances(branchId);
    const text = balances.map((b) => `${b.item.name}: ${b.quantity}`).join(', ');
    return { reply: `Stock summary: ${text || 'No stock yet.'}`, data: balances };
  }

  if (lower.includes('outstanding') || lower.includes('బాకీ') || lower.includes('बाकी')) {
    const where =
      actor.role === 'SUB_ADMIN'
        ? { branchId: actor.branchId!, deletedAt: null, outstanding: { gt: 0 } }
        : { deletedAt: null, outstanding: { gt: 0 } };
    const emps = await prisma.employee.findMany({
      where,
      select: { fullName: true, outstanding: true, employeeCode: true },
      orderBy: { outstanding: 'desc' },
      take: 10,
    });
    const text = emps.map((e) => `${e.fullName} ₹${e.outstanding}`).join(', ');
    return { reply: text ? `Top outstanding: ${text}` : 'No outstanding balances.', data: emps };
  }

  const helpByLang: Record<string, string> = {
    en: 'I am Ashok. Ask about stock, outstanding, or use voice: Ashok <employee> <item> stock-in <qty>.',
    te: 'నేను అశోక్. స్టాక్, బాకీ గురించి అడగండి లేదా వాయిస్ వాడండి.',
    hi: 'मैं अशोक हूँ। स्टॉक या बाकी पूछें, या वॉइस कमांड इस्तेमाल करें।',
    ml: 'ഞാൻ അശോക്. സ്റ്റോക്ക് അല്ലെങ്കിൽ ബാക്കി ചോദിക്കുക.',
    kn: 'ನಾನು ಅಶೋಕ್. ಸ್ಟಾಕ್ ಅಥವಾ ಬಾಕಿ ಕೇಳಿ.',
    ta: 'நான் அசோக். பங்கு அல்லது நிலுவை கேளுங்கள்.',
    or: 'ମୁଁ ଅଶୋକ। ଷ୍ଟକ୍ କିମ୍ବା ବକେୟା ପଚାରନ୍ତୁ।',
    mr: 'मी अशोक आहे. स्टॉक किंवा बाकी विचारा.',
  };

  return { reply: helpByLang[language] || helpByLang.en };
}
