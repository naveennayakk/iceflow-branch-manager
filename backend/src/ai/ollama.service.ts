import { env } from '../config/env';
import { prisma } from '../config/db';
import { AuthUser } from '../middleware/auth';
import { listBalances } from '../services/stock.service';
import { startOfDay, endOfDay } from '../utils/ids';

/** Pull live IceFlow DB snapshot scoped by role — Ashok answers ONLY from this. */
async function buildDbContext(actor: AuthUser): Promise<string> {
  const todayFrom = startOfDay();
  const todayTo = endOfDay();
  const lines: string[] = [
    `Today: ${todayFrom.toISOString().slice(0, 10)}`,
    `Asker: ${actor.displayName || actor.username} · role ${actor.role}`,
    'RULES: Answer ONLY using the LIVE DATA below. Never invent employees, amounts, stock, or branches. If data is missing, say so. Be concise.',
  ];

  if (actor.role === 'SUB_ADMIN') {
    const branchId = actor.branchId;
    if (!branchId) return 'No branch assigned.';
    const snap = await snapshotForBranch(branchId, todayFrom, todayTo);
    lines.push(snap);
    lines.push('SCOPE: Sub-branch only — never mention or invent other branches.');
    return lines.join('\n');
  }

  // MAIN_ADMIN — full application database
  const branches = await prisma.branch.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
  });
  const items = await prisma.item.findMany({
    where: { deletedAt: null, isActive: true },
    select: { name: true, code: true, packSize: true, packLabel: true },
    orderBy: { name: 'asc' },
  });
  lines.push(
    `Items/packs: ${items.map((i) => `${i.name}(${i.code}) ${i.packSize}/${i.packLabel}`).join('; ') || 'none'}`
  );

  for (const b of branches) {
    lines.push(await snapshotForBranch(b.id, todayFrom, todayTo));
  }

  const pendingExpenses = await prisma.expense.findMany({
    where: { status: 'pending', deletedAt: null },
    include: { branch: { select: { name: true } } },
    take: 30,
    orderBy: { expenseDate: 'desc' },
  });
  lines.push(
    `Pending expense approvals: ${
      pendingExpenses.map((e) => `${e.branch.name} ₹${e.amount} ${e.description}`).join('; ') || 'none'
    }`
  );

  const pendingRequests = await prisma.stockRequest.findMany({
    where: { status: 'pending' },
    include: {
      branch: { select: { name: true } },
      lines: { include: { item: { select: { name: true, packSize: true } } } },
    },
    take: 20,
    orderBy: { createdAt: 'desc' },
  });
  lines.push(
    `Pending stock requests: ${
      pendingRequests
        .map((r) => {
          const detail = r.lines
            .map((l) => {
              const pack = l.item.packSize || 1;
              return `${l.item.name} ${l.quantityAsked}pcs(~${Math.round(l.quantityAsked / pack)} box)`;
            })
            .join(', ');
          return `${r.requestNo} ${r.branch.name}: ${detail}`;
        })
        .join(' | ') || 'none'
    }`
  );

  lines.push('SCOPE: Main admin — you may summarize all branches.');
  return lines.join('\n');
}

async function snapshotForBranch(branchId: string, todayFrom: Date, todayTo: Date): Promise<string> {
  const [branch, balances, employees, sessions, expenses, requests] = await Promise.all([
    prisma.branch.findUnique({ where: { id: branchId } }),
    listBalances(branchId),
    prisma.employee.findMany({
      where: { branchId, deletedAt: null, status: 'active' },
      select: { fullName: true, employeeCode: true, outstanding: true, mobile: true },
      orderBy: { fullName: 'asc' },
    }),
    prisma.employeeSession.findMany({
      where: { branchId, sessionDate: { gte: todayFrom, lte: todayTo } },
      include: { employee: { select: { fullName: true } }, lines: { include: { item: { select: { name: true } } } } },
    }),
    prisma.expense.findMany({
      where: {
        branchId,
        deletedAt: null,
        expenseDate: { gte: new Date(Date.now() - 30 * 86400000) },
      },
      orderBy: { expenseDate: 'desc' },
      take: 15,
    }),
    prisma.stockRequest.findMany({
      where: { branchId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { lines: { include: { item: { select: { name: true } } } } },
    }),
  ]);

  const stock = balances.map((b) => `${b.item.name}=${b.quantity}`).join(', ') || 'empty';
  const emp = employees
    .map((e) => `${e.fullName}[${e.employeeCode}] borrow₹${e.outstanding} mob:${e.mobile}`)
    .join('; ');

  let grand = 0;
  let phonePe = 0;
  let cash = 0;
  const sessionBits = sessions.map((s) => {
    grand += s.totalBill;
    phonePe += s.phonePePaid;
    cash += s.cashPaid;
    const lines = s.lines
      .map((l) => `${l.item.name} out${l.stockOutQty}/in${l.stockInQty}`)
      .join(',');
    return `${s.employee.fullName}: bill₹${s.totalBill} PhonePe₹${s.phonePePaid} cash₹${s.cashPaid} (${s.status}) {${lines}}`;
  });

  const expBits = expenses
    .map((e) => `${e.status} ₹${e.amount} ${e.category}: ${e.description}`)
    .join('; ');
  const reqBits = requests
    .map(
      (r) =>
        `${r.requestNo} ${r.status}: ${r.lines.map((l) => `${l.item.name} ${l.quantityAsked}`).join(',')}`
    )
    .join('; ');

  return [
    `--- Branch ${branch?.name} (${branch?.code}) ${branch?.isMain ? 'MAIN' : 'SUB'} ---`,
    `Stock: ${stock}`,
    `Employees (${employees.length}): ${emp || 'none'}`,
    `Today payments: GrandTotal₹${grand} PhonePe₹${phonePe} CashToCollect₹${Math.max(0, grand - phonePe)} CashRecorded₹${cash}`,
    `Today sessions: ${sessionBits.join(' | ') || 'none'}`,
    `Recent expenses (30d): ${expBits || 'none'}`,
    `Recent stock requests: ${reqBits || 'none'}`,
  ].join('\n');
}

export async function ollamaAvailable(): Promise<boolean> {
  if (!env.ashokLlmEnabled) return false;
  try {
    const res = await fetch(`${env.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Deterministic answer from DB when LLM is offline — still uses live data, not canned prompts. */
async function dbDirectAnswer(message: string, actor: AuthUser): Promise<string> {
  const q = message.toLowerCase();
  const context = await buildDbContext(actor);

  if (/stock|inventory|available|స్టాక్|स्टॉक/.test(q)) {
    const stockLines = context
      .split('\n')
      .filter((l) => l.startsWith('Stock:') || l.includes('Stock:'))
      .join('\n');
    return stockLines || 'No stock data found in database.';
  }
  if (/payment|phonepe|cash|grand|collect|collection|income/.test(q)) {
    const pay = context
      .split('\n')
      .filter((l) => l.includes('Today payments:') || l.includes('GrandTotal'))
      .join('\n');
    return pay || 'No payment data for today.';
  }
  if (/employee|outstanding|borrow|staff/.test(q)) {
    const emp = context
      .split('\n')
      .filter((l) => l.startsWith('Employees') || l.includes('Employees ('))
      .join('\n');
    return emp || 'No employees found.';
  }
  if (/expense|bill|receipt/.test(q)) {
    const exp = context
      .split('\n')
      .filter((l) => l.includes('expense') || l.includes('Expenses'))
      .join('\n');
    return exp || 'No expenses found.';
  }
  if (/request|pack|box|cups|candy/.test(q)) {
    const req = context
      .split('\n')
      .filter((l) => l.toLowerCase().includes('request') || l.includes('Items/packs'))
      .join('\n');
    return req || 'No stock requests found.';
  }

  // Compact full snapshot for general questions
  return `Here is what is in the IceFlow database right now:\n${context.slice(0, 3500)}`;
}

export async function ashokLlmChat(
  message: string,
  actor: AuthUser,
  language = 'en'
): Promise<{ reply: string; source: 'ollama' | 'database'; data?: unknown }> {
  const context = await buildDbContext(actor);
  const langHint =
    language === 'en'
      ? 'Reply in English.'
      : `Reply in the user's language when possible (code: ${language}).`;

  const available = await ollamaAvailable();
  if (!available) {
    const reply = await dbDirectAnswer(message, actor);
    return {
      reply: `${reply}\n\n(Ollama offline — answered from live database. Start Ollama with model "${env.ollamaModel}" for conversational AI.)`,
      source: 'database',
    };
  }

  try {
    const res = await fetch(`${env.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.ollamaModel,
        stream: false,
        options: { temperature: 0.2 },
        messages: [
          {
            role: 'system',
            content: `You are Ashok inside IceFlow Branch Manager. You are connected to the live application database. ${langHint}
Do not use generic business advice. Do not invent numbers.
If the user asks about stock, payments, employees, expenses, requests, or packs — use LIVE DATABASE CONTEXT only.
For stock-out/stock-in voice commands, tell them to say: Ashok <employee> <item> stock-out/in <qty> then confirm Save.

LIVE DATABASE CONTEXT:
${context}`,
          },
          { role: 'user', content: message },
        ],
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!res.ok) {
      const reply = await dbDirectAnswer(message, actor);
      return { reply, source: 'database' };
    }

    const json = (await res.json()) as { message?: { content?: string } };
    const reply = json.message?.content?.trim() || (await dbDirectAnswer(message, actor));
    return { reply, source: 'ollama' };
  } catch {
    const reply = await dbDirectAnswer(message, actor);
    return { reply, source: 'database' };
  }
}
