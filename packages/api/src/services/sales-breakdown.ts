import {
  PAYMENT_METHODS,
  centsToMoney,
  type PaymentMethod,
  type SalesReport,
} from '@optiworld/shared';

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank transfer',
  CREDIT: 'Credit',
  OTHER: 'Other',
};

export type SaleSectionInput = {
  id: string;
  invoiceNumber: number;
  customerName: string;
  day: string;
  paymentType: PaymentMethod;
  total: number;
  discount: number;
  cash: number;
  credit: number;
  cost: number;
  lab: number;
  costMissing: boolean;
  cashier: string;
  lines: {
    productName: string;
    category: string;
    quantity: number;
    sale: number;
    cost: number | null;
  }[];
};

export type ReturnSectionInput = {
  id: string;
  invoiceNumber: number;
  customerName: string;
  amount: number;
  reason: string | null;
  by: string | null;
  kind: 'CANCELLED' | 'REMOVED';
};

type SalesSections = Pick<
  SalesReport,
  'dailySummary' | 'byProduct' | 'byCategory' | 'byPayment' | 'byCashier' | 'discounts' | 'returns'
>;

type ProductBucket = {
  productName: string;
  category: string;
  quantity: number;
  sale: number;
  discount: number;
  cost: number;
  profit: number;
  costMissing: boolean;
};

export function salesSections(
  owner: boolean,
  bills: readonly SaleSectionInput[],
  returns: readonly ReturnSectionInput[],
): SalesSections {
  const days = new Map<
    string,
    {
      invoiceCount: number;
      sale: number;
      discount: number;
      cash: number;
      credit: number;
      cost: number;
      lab: number;
      costMissing: boolean;
    }
  >();
  const products = new Map<string, ProductBucket>();
  const categories = new Map<string, Omit<ProductBucket, 'productName'>>();
  const payments = new Map<PaymentMethod, { invoiceCount: number; sale: number }>(
    PAYMENT_METHODS.map((method) => [method, { invoiceCount: 0, sale: 0 }]),
  );
  const cashiers = new Map<string, { invoiceCount: number; sale: number }>();

  for (const bill of bills) {
    const day = days.get(bill.day) ?? {
      invoiceCount: 0,
      sale: 0,
      discount: 0,
      cash: 0,
      credit: 0,
      cost: 0,
      lab: 0,
      costMissing: false,
    };
    day.invoiceCount += 1;
    day.sale += bill.total;
    day.discount += bill.discount;
    day.cash += bill.cash;
    day.credit += bill.credit;
    day.cost += bill.cost;
    day.lab += bill.lab;
    day.costMissing = day.costMissing || bill.costMissing;
    days.set(bill.day, day);

    const payment = payments.get(bill.paymentType) ?? { invoiceCount: 0, sale: 0 };
    payment.invoiceCount += 1;
    payment.sale += bill.total;
    payments.set(bill.paymentType, payment);

    const cashier = cashiers.get(bill.cashier) ?? { invoiceCount: 0, sale: 0 };
    cashier.invoiceCount += 1;
    cashier.sale += bill.total;
    cashiers.set(bill.cashier, cashier);

    const discountShares = lineShares(
      bill.lines.map((line) => line.sale),
      bill.discount,
    );
    const labShares = lineShares(
      bill.lines.map((line) => line.sale),
      bill.lab,
    );
    bill.lines.forEach((line, index) => {
      const discount = discountShares[index] ?? 0;
      const lab = labShares[index] ?? 0;
      const cost = line.cost ?? 0;
      const profit = line.sale - discount - cost - lab;
      addProduct(products, {
        productName: line.productName,
        category: line.category,
        quantity: line.quantity,
        sale: line.sale,
        discount,
        cost,
        profit,
        costMissing: line.cost === null,
      });
      addCategory(categories, line.category, {
        quantity: line.quantity,
        sale: line.sale,
        discount,
        cost,
        profit,
        costMissing: line.cost === null,
      });
    });
  }

  return {
    dailySummary: [...days.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, value]) => ({
        date,
        invoiceCount: value.invoiceCount,
        sale: centsToMoney(value.sale),
        discount: centsToMoney(value.discount),
        cash: centsToMoney(value.cash),
        credit: centsToMoney(value.credit),
        cost: owner ? centsToMoney(value.cost) : null,
        labExpense: owner ? centsToMoney(value.lab) : null,
        profit: owner ? centsToMoney(value.sale - value.cost - value.lab) : null,
        margin: owner ? marginOf(value.sale - value.cost - value.lab, value.sale) : null,
        costMissing: owner ? value.costMissing : false,
      })),
    byProduct: [...products.values()]
      .sort(
        (left, right) =>
          right.sale - left.sale || left.productName.localeCompare(right.productName),
      )
      .map((row) => moneyRow(owner, row)),
    byCategory: [...categories.entries()]
      .sort(
        ([leftName, left], [rightName, right]) =>
          right.sale - left.sale || leftName.localeCompare(rightName),
      )
      .map(([category, row]) => ({
        category,
        quantity: row.quantity,
        sale: centsToMoney(row.sale),
        discount: centsToMoney(row.discount),
        cost: owner ? centsToMoney(row.cost) : null,
        profit: owner ? centsToMoney(row.profit) : null,
        margin: owner ? marginOf(row.profit, row.sale) : null,
        costMissing: owner ? row.costMissing : false,
      })),
    byPayment: PAYMENT_METHODS.map((method) => {
      const value = payments.get(method) ?? { invoiceCount: 0, sale: 0 };
      return {
        method,
        label: PAYMENT_LABEL[method],
        invoiceCount: value.invoiceCount,
        sale: centsToMoney(value.sale),
      };
    }),
    byCashier: [...cashiers.entries()]
      .sort(([, left], [, right]) => right.sale - left.sale)
      .map(([name, value]) => ({
        name,
        invoiceCount: value.invoiceCount,
        sale: centsToMoney(value.sale),
      })),
    discounts: bills
      .filter((bill) => bill.discount > 0)
      .sort((left, right) => right.discount - left.discount)
      .map((bill) => ({
        invoiceId: bill.id,
        invoiceNumber: bill.invoiceNumber,
        customerName: bill.customerName,
        discount: centsToMoney(bill.discount),
        total: centsToMoney(bill.total),
      })),
    returns: returns.map((row) => ({
      invoiceId: row.id,
      invoiceNumber: row.invoiceNumber,
      customerName: row.customerName,
      amount: centsToMoney(row.amount),
      reason: row.reason,
      by: row.by,
      kind: row.kind,
    })),
  };
}

function moneyRow(owner: boolean, row: ProductBucket): SalesReport['byProduct'][number] {
  return {
    productName: row.productName,
    category: row.category,
    quantity: row.quantity,
    sale: centsToMoney(row.sale),
    discount: centsToMoney(row.discount),
    cost: owner ? centsToMoney(row.cost) : null,
    profit: owner ? centsToMoney(row.profit) : null,
    margin: owner ? marginOf(row.profit, row.sale) : null,
    costMissing: owner ? row.costMissing : false,
  };
}

function addProduct(target: Map<string, ProductBucket>, row: ProductBucket): void {
  const key = `${row.productName}\n${row.category}`;
  const current = target.get(key) ?? {
    productName: row.productName,
    category: row.category,
    quantity: 0,
    sale: 0,
    discount: 0,
    cost: 0,
    profit: 0,
    costMissing: false,
  };
  current.quantity += row.quantity;
  current.sale += row.sale;
  current.discount += row.discount;
  current.cost += row.cost;
  current.profit += row.profit;
  current.costMissing = current.costMissing || row.costMissing;
  target.set(key, current);
}

function addCategory(
  target: Map<string, Omit<ProductBucket, 'productName'>>,
  category: string,
  row: Omit<ProductBucket, 'productName' | 'category'>,
): void {
  const current = target.get(category) ?? {
    category,
    quantity: 0,
    sale: 0,
    discount: 0,
    cost: 0,
    profit: 0,
    costMissing: false,
  };
  current.quantity += row.quantity;
  current.sale += row.sale;
  current.discount += row.discount;
  current.cost += row.cost;
  current.profit += row.profit;
  current.costMissing = current.costMissing || row.costMissing;
  target.set(category, current);
}

function lineShares(weights: readonly number[], amount: number): number[] {
  const base = weights.reduce((sum, weight) => sum + weight, 0);
  if (amount <= 0 || base <= 0 || weights.length === 0) {
    return weights.map(() => 0);
  }
  let used = 0;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) {
      return amount - used;
    }
    const share = Math.floor((amount * weight) / base);
    used += share;
    return share;
  });
}

function marginOf(profit: number, sale: number): string | null {
  if (sale <= 0) {
    return null;
  }
  const text = ((profit / sale) * 100).toFixed(2);
  return text === '-0.00' ? '0.00' : text;
}
