
import prisma from "../db.server";

const PACKAGES = [
  "Starter",
  "Business",
  "Professional",
  "Enterprise",
];

function getBerlinMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const year = parts.find(
    (part) => part.type === "year"
  )?.value;

  const month = parts.find(
    (part) => part.type === "month"
  )?.value;

  return `${year}-${month}`;
}


export async function ensureMonthlyPackageBudgets(
  date = new Date()
) {
  const month = getBerlinMonth(date);

  return prisma.$transaction(async (tx) => {
    // Dieselbe Sperre wie bei der Budget-Speicherung.
await tx.$queryRaw`
  SELECT pg_advisory_xact_lock(824105, 1)::text
`;

    const [existing, previous, defaults] =
      await Promise.all([
        tx.adsMonthlyPackageBudget.findMany({
          where: { month },
        }),

        tx.adsMonthlyPackageBudget.findMany({
          where: {
            month: { lt: month },
          },
          orderBy: {
            month: "desc",
          },
        }),

        tx.adsPackageBudget.findMany(),
      ]);

    const results = [];

    for (const packageName of PACKAGES) {
      const current = existing.find(
        (item) => item.package === packageName
      );

      if (current) {
        results.push(current);
        continue;
      }

      const previousBudget = previous.find(
        (item) => item.package === packageName
      );

      const defaultBudget = defaults.find(
        (item) =>
          item.package.toLowerCase() ===
          packageName.toLowerCase()
      );

      const monthlyBudgetCents =
        previousBudget?.monthlyBudgetCents ??
        defaultBudget?.monthlyBudgetCents ??
        0;

      const saved =
        await tx.adsMonthlyPackageBudget.upsert({
          where: {
            month_package: {
              month,
              package: packageName,
            },
          },
          create: {
            month,
            package: packageName,
            monthlyBudgetCents,
          },
          update: {},
        });

      results.push(saved);
    }

    return results;
  }, {
    maxWait: 10000,
    timeout: 15000,
  });
}
