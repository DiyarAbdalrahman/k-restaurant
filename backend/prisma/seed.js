/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

/* =========================
   USERS
========================= */
async function upsertUser({ username, password, fullName, role }) {
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({
    where: { username },
  });

  if (existing) {
    return prisma.user.update({
      where: { username },
      data: {
        passwordHash,
        fullName,
        role,
        isActive: true,
      },
    });
  }

  return prisma.user.create({
    data: {
      username,
      passwordHash,
      fullName,
      role,
      isActive: true,
    },
  });
}

/* =========================
   MENU
========================= */
const menuData = [
  {
    name: "Mains",
    items: [
      { name: "Special Qozi", basePrice: 13 },
      { name: "Lamb Kawrma", basePrice: 13 },
      { name: "Lamb Qozi", basePrice: 10 },
      { name: "Mixed Qozi", basePrice: 11 },
      { name: "Chicken Qozi", basePrice: 9 },
      { name: "Tashreeb", basePrice: 8 },
      { name: "Falafel (Main)", basePrice: 8 },
      { name: "Kuba", basePrice: 10 },
      { name: "Organic Chicken", basePrice: 12 },
    ],
  },
  {
    name: "Salads",
    items: [
      { name: "Special Salad", basePrice: 7 },
      { name: "Middle Eastern Salad", basePrice: 5 },
      { name: "Caeser Salad", basePrice: 7 },
      { name: "Tabouleh", basePrice: 5 },
      { name: "Fattoush Salad", basePrice: 7 },
      { name: "Chicken Salad", basePrice: 8 },
      { name: "Greek Salad", basePrice: 6 },
      { name: "Sour Red Onions", basePrice: 2 },
    ],
  },
  {
    name: "Sides",
    items: [
      { name: "Rice", basePrice: 3 },
      { name: "Fries", basePrice: 3 },
      { name: "Bread", basePrice: 1.5 },
      { name: "Yoghurt", basePrice: 2 },
    ],
  },
  {
    name: "Drinks",
    items: [
      { name: "Water", basePrice: 1.5 },
      { name: "Cola", basePrice: 2 },
      { name: "Diet Cola", basePrice: 2 },
      { name: "Orange Juice", basePrice: 3 },
      { name: "Tea", basePrice: 2 },
    ],
  },
];

async function upsertCategory(name, sortOrder = 0) {
  const existing = await prisma.menuCategory.findFirst({
    where: { name },
  });

  if (existing) return existing;

  return prisma.menuCategory.create({
    data: { name, sortOrder },
  });
}

async function upsertMenuItem({ categoryId, name, basePrice }) {
  const existing = await prisma.menuItem.findFirst({
    where: { name, categoryId },
  });

  if (existing) {
    return prisma.menuItem.update({
      where: { id: existing.id },
      data: { basePrice, isActive: true },
    });
  }

  return prisma.menuItem.create({
    data: {
      name,
      basePrice,
      categoryId,
      isActive: true,
    },
  });
}

/* =========================
   MAIN
========================= */
async function main() {
  console.log("🌱 Seeding users...");

  await upsertUser({
    username: "pos1",
    password: "pos1234",
    fullName: "POS User",
    role: "pos",
  });

  await upsertUser({
    username: "kitchen1",
    password: "kitchen1234",
    fullName: "Kitchen User",
    role: "kitchen",
  });

  await upsertUser({
    username: "manager1",
    password: "manager1234",
    fullName: "Manager User",
    role: "manager",
  });

  console.log("✅ Users ready");

  console.log("🌱 Seeding menu...");

  let sort = 1;
  for (const cat of menuData) {
    const category = await upsertCategory(cat.name, sort++);

    for (const item of cat.items) {
      await upsertMenuItem({
        categoryId: category.id,
        name: item.name,
        basePrice: item.basePrice,
      });
    }
  }

  console.log("✅ Menu ready");
}

/* =========================
   RUN
========================= */
main()
  .catch((e) => {
    console.error("❌ Seed failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
