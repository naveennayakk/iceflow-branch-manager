import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function hash(p: string) {
  return argon2.hash(p, { type: argon2.argon2id });
}

async function main() {
  fs.mkdirSync(path.resolve(__dirname, '../../data'), { recursive: true });
  fs.mkdirSync(path.resolve(__dirname, '../../data/backups'), { recursive: true });
  fs.mkdirSync(path.resolve(__dirname, '../../data/uploads'), { recursive: true });

  console.log('Seeding IceFlow Branch Manager...');

  await prisma.syncEvent.deleteMany();
  await prisma.voiceEntry.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.fraudAlert.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.sessionLine.deleteMany();
  await prisma.employeeSession.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.dispatchLine.deleteMany();
  await prisma.stockDispatch.deleteMany();
  await prisma.stockRequestLine.deleteMany();
  await prisma.stockRequest.deleteMany();
  await prisma.damageRequest.deleteMany();
  await prisma.eventOrderLine.deleteMany();
  await prisma.eventOrder.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.stockBalance.deleteMany();
  await prisma.rateHistory.deleteMany();
  await prisma.itemRequest.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branchPermission.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.item.deleteMany();
  await prisma.category.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.backupRecord.deleteMany();

  const mainBranch = await prisma.branch.create({
    data: {
      code: 'MAIN01',
      name: 'IceFlow Main Branch',
      address: 'Hyderabad Warehouse',
      city: 'Hyderabad',
      state: 'Telangana',
      isMain: true,
      language: 'en',
    },
  });

  const sub1 = await prisma.branch.create({
    data: {
      code: 'BR007',
      name: 'Madhapur Sub-branch',
      address: 'Madhapur, Hyderabad',
      city: 'Hyderabad',
      state: 'Telangana',
      phone: '9876543210',
      language: 'te',
      weatherCity: 'Hyderabad',
    },
  });

  const sub2 = await prisma.branch.create({
    data: {
      code: 'BR003',
      name: 'Vijayawada Sub-branch',
      address: 'Benz Circle',
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      language: 'te',
    },
  });

  const mainAdminPass = process.env.MAIN_ADMIN_PASSWORD || 'IceFlow@Main2026';
  const mainAdminUser = process.env.MAIN_ADMIN_USERNAME || 'mainadmin';

  await prisma.user.create({
    data: {
      username: mainAdminUser,
      email: process.env.MAIN_ADMIN_EMAIL || 'mainadmin@iceflow.app',
      passwordHash: await hash(mainAdminPass),
      role: 'MAIN_ADMIN',
      displayName: 'Main Branch Admin',
      language: 'en',
      pinHash: await hash('1234'),
    },
  });

  await prisma.user.create({
    data: {
      username: 'madhapur',
      email: 'madhapur@iceflow.app',
      passwordHash: await hash('Branch@007'),
      role: 'SUB_ADMIN',
      branchId: sub1.id,
      displayName: 'Madhapur Admin',
      language: 'te',
      pinHash: await hash('1234'),
    },
  });

  await prisma.user.create({
    data: {
      username: 'vijayawada',
      email: 'vijayawada@iceflow.app',
      passwordHash: await hash('Branch@003'),
      role: 'SUB_ADMIN',
      branchId: sub2.id,
      displayName: 'Vijayawada Admin',
      language: 'te',
      pinHash: await hash('1234'),
    },
  });

  const cats = await Promise.all(
    ['Cups', 'Candy', 'Cones', 'Bars', 'Packs', 'Beverages'].map((name, i) =>
      prisma.category.create({ data: { name, sortOrder: i } })
    )
  );

  const itemDefs = [
    { code: 'CUPS', name: 'Cups', cat: 0, main: 3, emp: 5, packSize: 24, packLabel: 'box' },
    { code: 'CANDY', name: 'Candy', cat: 1, main: 4, emp: 5, packSize: 50, packLabel: 'box' },
    { code: 'CONE', name: 'Cones', cat: 2, main: 5, emp: 8, packSize: 20, packLabel: 'box' },
    { code: 'CHOCO', name: 'Chocobar', cat: 3, main: 8, emp: 12, packSize: 30, packLabel: 'box' },
    { code: 'STICK', name: 'Ice Cream Stick', cat: 3, main: 6, emp: 10, packSize: 40, packLabel: 'box' },
    { code: 'FAMILY', name: 'Family Pack', cat: 4, main: 40, emp: 60, packSize: 6, packLabel: 'case' },
    { code: 'WATER', name: 'Water Bottle', cat: 5, main: 8, emp: 12, packSize: 12, packLabel: 'pack' },
  ];

  const mainUser = await prisma.user.findUnique({ where: { username: mainAdminUser } });

  for (const def of itemDefs) {
    const item = await prisma.item.create({
      data: {
        code: def.code,
        name: def.name,
        categoryId: cats[def.cat].id,
        unit: 'pieces',
        packSize: def.packSize,
        packLabel: def.packLabel,
        minStockThreshold: 20,
      },
    });
    await prisma.rateHistory.createMany({
      data: [
        {
          itemId: item.id,
          rateType: 'MAIN_TO_SUB',
          amount: def.main,
          effectiveFrom: new Date('2026-01-01'),
          changedBy: mainUser!.id,
          reason: 'Initial catalog rate',
        },
        {
          itemId: item.id,
          rateType: 'SUB_TO_EMPLOYEE',
          amount: def.emp,
          effectiveFrom: new Date('2026-01-01'),
          changedBy: mainUser!.id,
          reason: 'Initial employee rate',
        },
      ],
    });

    // Opening stock at main and sub1
    for (const [branchId, qty] of [
      [mainBranch.id, 5000],
      [sub1.id, 200],
      [sub2.id, 150],
    ] as const) {
      await prisma.stockBalance.create({
        data: { branchId, itemId: item.id, quantity: qty },
      });
      await prisma.stockMovement.create({
        data: {
          branchId,
          itemId: item.id,
          quantity: qty,
          movementType: 'opening_balance',
          direction: 'in',
          createdById: mainUser!.id,
          costRate: def.main,
          employeeRate: def.emp,
          notes: 'Seed opening balance',
        },
      });
    }
  }

  const emp1 = await prisma.employee.create({
    data: {
      employeeCode: '701',
      fullName: 'Sai Kumar',
      mobile: '9000000001',
      address: 'Madhapur',
      branchId: sub1.id,
      outstanding: 0,
    },
  });
  await prisma.employee.create({
    data: {
      employeeCode: '702',
      fullName: 'Ravi Teja',
      mobile: '9000000002',
      branchId: sub1.id,
    },
  });
  await prisma.employee.create({
    data: {
      employeeCode: '301',
      fullName: 'Lakshmi',
      mobile: '9000000003',
      branchId: sub2.id,
    },
  });

  await prisma.holiday.create({
    data: { name: 'Diwali', date: new Date('2026-11-08'), isNational: true },
  });

  await prisma.appSetting.createMany({
    data: [
      { key: 'app.name', value: 'IceFlow Branch Manager' },
      { key: 'assistant.name', value: 'Ashok' },
      { key: 'default.language', value: 'en' },
      { key: 'currency', value: 'INR' },
      { key: 'voice.wakeWord', value: 'Ashok' },
    ],
  });

  await prisma.notification.create({
    data: {
      targetRole: 'ALL',
      title: 'Welcome to IceFlow',
      body: 'Ashok AI assistant is ready. Say Ashok before voice commands.',
      type: 'system',
      severity: 'info',
    },
  });

  console.log('Seed complete.');
  console.log('Main Admin:', mainAdminUser, '/', mainAdminPass);
  console.log('Sub Madhapur: madhapur / Branch@007');
  console.log('Sub Vijayawada: vijayawada / Branch@003');
  console.log('Sample employee:', emp1.fullName, emp1.employeeCode);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
