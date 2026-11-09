import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;
const DEV_PASSWORD = 'OptiWorld123!';

const prisma = new PrismaClient();

const ids = {
  brightview: '10000000-0000-4000-8000-000000000001',
  clearpath: '10000000-0000-4000-8000-000000000002',
  lensline: '10000000-0000-4000-8000-000000000003',
  precision: '10000000-0000-4000-8000-000000000004',
  crystal: '10000000-0000-4000-8000-000000000008',
  northstar: '10000000-0000-4000-8000-000000000009',
  superAdmin: '20000000-0000-4000-8000-000000000001',
  brightviewOwner: '20000000-0000-4000-8000-000000000002',
  brightviewStaff: '20000000-0000-4000-8000-000000000003',
  lenslineAdmin: '20000000-0000-4000-8000-000000000004',
  lenslineHandler: '20000000-0000-4000-8000-000000000005',
  precisionAdmin: '20000000-0000-4000-8000-000000000006',
  precisionTech: '20000000-0000-4000-8000-000000000007',
  crystalAdmin: '20000000-0000-4000-8000-000000000014',
  crystalTech: '20000000-0000-4000-8000-000000000015',
  northstarAdmin: '20000000-0000-4000-8000-000000000016',
  northstarTech: '20000000-0000-4000-8000-000000000017',
  clearpathOwner: '20000000-0000-4000-8000-000000000008',
  clearpathStaff: '20000000-0000-4000-8000-000000000009',
  customerAyesha: '30000000-0000-4000-8000-000000000001',
  customerBilal: '30000000-0000-4000-8000-000000000002',
  batchFrame: '40000000-0000-4000-8000-000000000001',
  batchLens: '40000000-0000-4000-8000-000000000002',
  batchCoating: '40000000-0000-4000-8000-000000000003',
  invoicePaid: '50000000-0000-4000-8000-000000000001',
  invoiceCredit: '50000000-0000-4000-8000-000000000002',
  invoiceOffline: '50000000-0000-4000-8000-000000000003',
  catalogSv: '60000000-0000-4000-8000-000000000001',
  catalogHi: '60000000-0000-4000-8000-000000000002',
  catalogFrame: '60000000-0000-4000-8000-000000000003',
  catalogSolution: '60000000-0000-4000-8000-000000000004',
  connectionFull: '70000000-0000-4000-8000-000000000001',
  connectionHidden: '70000000-0000-4000-8000-000000000002',
  orderPending: '80000000-0000-4000-8000-000000000001',
  orderConfirmed: '80000000-0000-4000-8000-000000000002',
  threadConfirmed: '90000000-0000-4000-8000-000000000001',
  labJob: 'a0000000-0000-4000-8000-000000000001',
} as const;

const periodStart = new Date('2026-09-01T00:00:00.000Z');
const periodEnd = new Date('2027-09-01T00:00:00.000Z');
const orderLockedAt = new Date('2026-09-15T10:30:00.000Z');

const frameDetails: Prisma.InputJsonObject = {
  type: 'Full rim',
  material: 'Metal',
  eyeSize: 52,
};

const prescription: Prisma.InputJsonObject = {
  rightEye: { sphere: '-2.25', cylinder: '-0.50', axis: 180 },
  leftEye: { sphere: '-2.00', cylinder: '-0.75', axis: 175 },
  pupillaryDistance: 62,
};

const proposedChanges: Prisma.InputJsonObject = {
  items: [
    {
      catalogProductId: ids.catalogHi,
      productName: 'Progressive HD',
      quantity: 4,
      agreedPrice: '1250.00',
    },
  ],
};

async function clearDevData(tx: Prisma.TransactionClient): Promise<void> {
  await tx.passwordResetToken.deleteMany();
  await tx.refreshToken.deleteMany();
  await tx.changeRequest.deleteMany();
  await tx.chatMessage.deleteMany();
  await tx.chatThread.deleteMany();
  await tx.orderItem.deleteMany();
  await tx.order.deleteMany();
  await tx.retailerConnection.deleteMany();
  await tx.payment.deleteMany();
  await tx.labJobStatusHistory.deleteMany();
  await tx.labJob.deleteMany();
  await tx.invoiceItem.deleteMany();
  await tx.invoice.deleteMany();
  await tx.invoiceSequence.deleteMany();
  await tx.alert.deleteMany();
  await tx.auditLog.deleteMany();
  await tx.organisationInvite.deleteMany();
  await tx.labInventory.deleteMany();
  await tx.labClient.deleteMany();
  await tx.catalogProduct.deleteMany();
  await tx.inventoryBatch.deleteMany();
  await tx.customer.deleteMany();
  await tx.subscription.deleteMany();
  await tx.suggestedReplyChip.deleteMany();
  await tx.user.deleteMany();
  await tx.superAdmin.deleteMany();
  await tx.organisation.deleteMany();
}

async function seed(tx: Prisma.TransactionClient, passwordHash: string): Promise<void> {
  await tx.organisation.createMany({
    data: [
      {
        id: ids.brightview,
        name: 'BrightView Optics',
        username: 'brightview',
        type: 'RETAILER',
        status: 'ACTIVE',
        phone: '+92 42 1110001',
        city: 'Lahore',
        address: '14 Mall Road, Lahore',
        whatsappNumber: '+92 300 0000002',
        subscriptionStatus: 'ACTIVE',
        planType: 'RETAILER_STANDARD',
      },
      {
        id: ids.clearpath,
        name: 'ClearPath Eyewear',
        username: 'clearpath',
        type: 'RETAILER',
        status: 'ACTIVE',
        phone: '+92 21 1110002',
        city: 'Karachi',
        address: '8 Clifton Block 5, Karachi',
        whatsappNumber: '+92 300 0000008',
        subscriptionStatus: 'ACTIVE',
        planType: 'RETAILER_STANDARD',
      },
      {
        id: ids.lensline,
        name: 'LensLine Distributors',
        username: 'lensline',
        type: 'WHOLESALER',
        status: 'ACTIVE',
        phone: '+92 42 1110003',
        city: 'Lahore',
        address: '22 Industrial Estate, Lahore',
        whatsappNumber: '+92 300 0000004',
        listingProfileNotes: 'Stock lenses and metal frames for approved retailers.',
        subscriptionStatus: 'ACTIVE',
        planType: 'WHOLESALER_STANDARD',
      },
      {
        id: ids.precision,
        name: 'Precision Lens Lab',
        username: 'precisionlab',
        type: 'LABORATORY',
        status: 'ACTIVE',
        phone: '+92 42 1110004',
        city: 'Lahore',
        address: '5 Laboratory Lane, Lahore',
        whatsappNumber: '+92 300 0000006',
        subscriptionStatus: 'ACTIVE',
        planType: 'LABORATORY_STANDARD',
      },
      {
        id: ids.crystal,
        name: 'Crystal Cut Lab',
        username: 'crystalcut',
        type: 'LABORATORY',
        status: 'ACTIVE',
        phone: '+92 21 1110008',
        city: 'Karachi',
        address: '18 Saddar Laboratory Road, Karachi',
        whatsappNumber: '+92 300 0000014',
        subscriptionStatus: 'ACTIVE',
        planType: 'LABORATORY_STANDARD',
      },
      {
        id: ids.northstar,
        name: 'Northstar Optical Lab',
        username: 'northstarlab',
        type: 'LABORATORY',
        status: 'ACTIVE',
        phone: '+92 51 1110009',
        city: 'Islamabad',
        address: '9 Blue Area, Islamabad',
        whatsappNumber: '+92 300 0000016',
        subscriptionStatus: 'ACTIVE',
        planType: 'LABORATORY_STANDARD',
      },
    ],
  });

  await tx.superAdmin.create({
    data: {
      id: ids.superAdmin,
      email: 'superadmin@optiworld.example',
      passwordHash,
      name: 'Platform Admin',
    },
  });

  await tx.user.createMany({
    data: [
      {
        id: ids.brightviewOwner,
        orgId: ids.brightview,
        email: 'owner@brightview.example',
        passwordHash,
        role: 'OWNER',
        name: 'Sara Ahmed',
        phone: '+92 300 0000002',
      },
      {
        id: ids.brightviewStaff,
        orgId: ids.brightview,
        email: 'staff@brightview.example',
        passwordHash,
        role: 'STAFF',
        name: 'Hina Qureshi',
        phone: '+92 300 0000003',
      },
      {
        id: ids.lenslineAdmin,
        orgId: ids.lensline,
        email: 'admin@lensline.example',
        passwordHash,
        role: 'ADMIN',
        name: 'Omar Farooq',
        phone: '+92 300 0000004',
      },
      {
        id: ids.lenslineHandler,
        orgId: ids.lensline,
        email: 'orders@lensline.example',
        passwordHash,
        role: 'ORDER_HANDLER',
        name: 'Nadia Shah',
        phone: '+92 300 0000005',
      },
      {
        id: ids.precisionAdmin,
        orgId: ids.precision,
        email: 'admin@precisionlab.example',
        passwordHash,
        role: 'ADMIN',
        name: 'Kamran Ali',
        phone: '+92 300 0000006',
      },
      {
        id: ids.precisionTech,
        orgId: ids.precision,
        email: 'tech@precisionlab.example',
        passwordHash,
        role: 'TECHNICIAN',
        name: 'Usman Raza',
        phone: '+92 300 0000007',
      },
      {
        id: ids.crystalAdmin,
        orgId: ids.crystal,
        email: 'admin@crystalcut.example',
        passwordHash,
        role: 'ADMIN',
        name: 'Amina Shah',
        phone: '+92 300 0000014',
      },
      {
        id: ids.crystalTech,
        orgId: ids.crystal,
        email: 'tech@crystalcut.example',
        passwordHash,
        role: 'TECHNICIAN',
        name: 'Farhan Javed',
        phone: '+92 300 0000015',
      },
      {
        id: ids.northstarAdmin,
        orgId: ids.northstar,
        email: 'admin@northstarlab.example',
        passwordHash,
        role: 'ADMIN',
        name: 'Hira Siddiqui',
        phone: '+92 300 0000016',
      },
      {
        id: ids.northstarTech,
        orgId: ids.northstar,
        email: 'tech@northstarlab.example',
        passwordHash,
        role: 'TECHNICIAN',
        name: 'Bilal Qureshi',
        phone: '+92 300 0000017',
      },
      {
        id: ids.clearpathOwner,
        orgId: ids.clearpath,
        email: 'owner@clearpath.example',
        passwordHash,
        role: 'OWNER',
        name: 'Fatima Noor',
        phone: '+92 300 0000008',
      },
      {
        id: ids.clearpathStaff,
        orgId: ids.clearpath,
        email: 'staff@clearpath.example',
        passwordHash,
        role: 'STAFF',
        name: 'Imran Malik',
        phone: '+92 300 0000009',
      },
    ],
  });

  await tx.subscription.createMany({
    data: [
      {
        orgId: ids.brightview,
        planType: 'RETAILER_STANDARD',
        status: 'ACTIVE',
        startDate: periodStart,
        endDate: periodEnd,
        renewalDate: periodEnd,
      },
      {
        orgId: ids.clearpath,
        planType: 'RETAILER_STANDARD',
        status: 'ACTIVE',
        startDate: periodStart,
        endDate: periodEnd,
        renewalDate: periodEnd,
      },
      {
        orgId: ids.lensline,
        planType: 'WHOLESALER_STANDARD',
        status: 'ACTIVE',
        startDate: periodStart,
        endDate: periodEnd,
        renewalDate: periodEnd,
      },
      {
        orgId: ids.precision,
        planType: 'LABORATORY_STANDARD',
        status: 'ACTIVE',
        startDate: periodStart,
        endDate: periodEnd,
        renewalDate: periodEnd,
      },
      {
        orgId: ids.crystal,
        planType: 'LABORATORY_STANDARD',
        status: 'ACTIVE',
        startDate: periodStart,
        endDate: periodEnd,
        renewalDate: periodEnd,
      },
      {
        orgId: ids.northstar,
        planType: 'LABORATORY_STANDARD',
        status: 'ACTIVE',
        startDate: periodStart,
        endDate: periodEnd,
        renewalDate: periodEnd,
      },
    ],
  });

  await tx.customer.createMany({
    data: [
      {
        id: ids.customerAyesha,
        orgId: ids.brightview,
        name: 'Ayesha Khan',
        phone: '+92 321 1000001',
        email: 'ayesha.khan@example.com',
        address: '12 Commercial Lane, Sample City',
        creditLimit: '25000.00',
        prescriptionNotes: 'Progressive lenses. Prefers anti-reflective coating.',
      },
      {
        id: ids.customerBilal,
        orgId: ids.brightview,
        name: 'Bilal Hussain',
        phone: '+92 321 1000002',
        email: 'bilal.hussain@example.com',
        address: '48 Market Road, Sample City',
        creditLimit: '0.00',
      },
    ],
  });

  await tx.inventoryBatch.createMany({
    data: [
      {
        id: ids.batchFrame,
        orgId: ids.brightview,
        priceCode: '1042',
        prefix: 'RB',
        productName: 'Metro Rectangle Frame',
        brand: 'Metro',
        category: 'Frames',
        costPrice: '2800.00',
        salePrice: '4500.00',
        stockQty: 11,
        lowStockThreshold: 3,
      },
      {
        id: ids.batchLens,
        orgId: ids.brightview,
        priceCode: '2201',
        prefix: 'SV',
        productName: 'Single Vision CR-39',
        brand: 'OptiClear',
        category: 'Lenses',
        costPrice: '900.00',
        salePrice: '1800.00',
        stockQty: 38,
        lowStockThreshold: 10,
      },
      {
        id: ids.batchCoating,
        orgId: ids.brightview,
        priceCode: '3304',
        prefix: 'AR',
        productName: 'Anti-Reflective Coating',
        brand: 'OptiClear',
        category: 'Coatings',
        costPrice: '250.00',
        salePrice: '700.00',
        stockQty: 2,
        lowStockThreshold: 5,
      },
    ],
  });

  await tx.invoice.createMany({
    data: [
      {
        id: ids.invoicePaid,
        orgId: ids.brightview,
        customerId: ids.customerBilal,
        invoiceNumber: 1,
        status: 'PAID',
        total: '4500.00',
        discount: '0.00',
        paymentType: 'CASH',
        isOffline: false,
        issuedAt: new Date('2026-09-10T11:00:00.000Z'),
        syncedAt: new Date('2026-09-10T11:00:00.000Z'),
      },
      {
        id: ids.invoiceCredit,
        orgId: ids.brightview,
        customerId: ids.customerAyesha,
        invoiceNumber: 2,
        status: 'CREDIT',
        total: '3500.00',
        discount: '100.00',
        paymentType: 'CREDIT',
        isOffline: false,
        issuedAt: new Date('2026-09-12T14:00:00.000Z'),
        syncedAt: new Date('2026-09-12T14:00:00.000Z'),
      },
      {
        id: ids.invoiceOffline,
        orgId: ids.brightview,
        customerId: ids.customerBilal,
        localId: '50000000-0000-4000-8000-000000000013',
        invoiceNumber: 3,
        status: 'PAID',
        total: '700.00',
        discount: '0.00',
        paymentType: 'CASH',
        isOffline: true,
        issuedAt: new Date('2026-09-20T16:00:00.000Z'),
        syncedAt: null,
      },
    ],
  });

  await tx.invoiceItem.createMany({
    data: [
      {
        invoiceId: ids.invoicePaid,
        inventoryBatchId: ids.batchFrame,
        productName: 'Metro Rectangle Frame',
        priceCode: '1042',
        quantity: 1,
        unitPrice: '4500.00',
        salePrice: '4500.00',
      },
      {
        invoiceId: ids.invoiceCredit,
        inventoryBatchId: ids.batchLens,
        productName: 'Single Vision CR-39',
        priceCode: '2201',
        quantity: 2,
        unitPrice: '1800.00',
        salePrice: '1800.00',
      },
      {
        invoiceId: ids.invoiceOffline,
        inventoryBatchId: ids.batchCoating,
        productName: 'Anti-Reflective Coating',
        priceCode: '3304',
        quantity: 1,
        unitPrice: '700.00',
        salePrice: '700.00',
      },
    ],
  });

  await tx.invoiceSequence.create({
    data: { orgId: ids.brightview, lastNumber: 3 },
  });

  await tx.payment.createMany({
    data: [
      {
        customerId: ids.customerBilal,
        invoiceId: ids.invoicePaid,
        orgId: ids.brightview,
        amount: '4500.00',
        method: 'CASH',
        notes: 'Paid in full at the counter.',
        recordedAt: new Date('2026-09-10T11:05:00.000Z'),
      },
      {
        customerId: ids.customerAyesha,
        invoiceId: ids.invoiceCredit,
        orgId: ids.brightview,
        amount: '1000.00',
        method: 'UPI',
        notes: 'Part payment against the credit invoice.',
        recordedAt: new Date('2026-09-12T14:10:00.000Z'),
      },
      {
        customerId: ids.customerBilal,
        invoiceId: ids.invoiceOffline,
        orgId: ids.brightview,
        amount: '700.00',
        method: 'CASH',
        recordedAt: new Date('2026-09-20T16:00:00.000Z'),
      },
    ],
  });

  await tx.catalogProduct.createMany({
    data: [
      {
        id: ids.catalogSv,
        orgId: ids.lensline,
        name: 'CR39 SV',
        category: 'Lenses',
        description: 'CR-39 single vision stock lens, hard coated.',
        listedPrice: '900.00',
        isPriceOnRequest: false,
        availabilityStatus: 'AVAILABLE',
        productCode: 'CR39-SV',
        displayOrder: 1,
      },
      {
        id: ids.catalogHi,
        orgId: ids.lensline,
        name: 'Progressive HD',
        category: 'Lenses',
        description: 'High-definition progressive lens.',
        listedPrice: '1400.00',
        isPriceOnRequest: false,
        availabilityStatus: 'AVAILABLE',
        productCode: 'PROG-HD',
        displayOrder: 2,
      },
      {
        id: ids.catalogSolution,
        orgId: ids.lensline,
        name: 'Blue Cut SV',
        category: 'Lenses',
        description: 'Single vision lens with a blue-light filter.',
        listedPrice: '1100.00',
        isPriceOnRequest: false,
        availabilityStatus: 'AVAILABLE',
        productCode: 'BC-SV',
        displayOrder: 3,
      },
      {
        id: ids.catalogFrame,
        orgId: ids.lensline,
        name: 'Metal Frame',
        category: 'Frames',
        description: 'Wholesale metal frame. Price is quoted per retailer.',
        listedPrice: null,
        isPriceOnRequest: true,
        availabilityStatus: 'AVAILABLE',
        productCode: 'MTL-FR',
        displayOrder: 4,
      },
    ],
  });

  await tx.retailerConnection.createMany({
    data: [
      {
        id: ids.connectionFull,
        wholesalerOrgId: ids.lensline,
        retailerOrgId: ids.brightview,
        status: 'APPROVED',
        visibilityMode: 'FULL',
        approvedAt: new Date('2026-09-05T09:00:00.000Z'),
      },
      {
        id: ids.connectionHidden,
        wholesalerOrgId: ids.lensline,
        retailerOrgId: ids.clearpath,
        status: 'APPROVED',
        visibilityMode: 'PRICES_HIDDEN',
        approvedAt: new Date('2026-09-06T09:00:00.000Z'),
      },
    ],
  });

  await tx.order.createMany({
    data: [
      {
        id: ids.orderPending,
        wholesalerOrgId: ids.lensline,
        retailerOrgId: ids.brightview,
        connectionId: ids.connectionFull,
        status: 'PENDING',
        totalValue: '8500.00',
        lockedAt: null,
      },
      {
        id: ids.orderConfirmed,
        wholesalerOrgId: ids.lensline,
        retailerOrgId: ids.brightview,
        connectionId: ids.connectionFull,
        status: 'CONFIRMED',
        totalValue: '6500.00',
        lockedAt: orderLockedAt,
      },
    ],
  });

  await tx.orderItem.createMany({
    data: [
      {
        orderId: ids.orderPending,
        catalogProductId: ids.catalogSv,
        productName: 'CR39 SV',
        quantity: 10,
        agreedPrice: '850.00',
      },
      {
        orderId: ids.orderConfirmed,
        catalogProductId: ids.catalogHi,
        productName: 'Progressive HD',
        quantity: 5,
        agreedPrice: '1300.00',
      },
    ],
  });

  await tx.chatThread.create({
    data: {
      id: ids.threadConfirmed,
      orderId: ids.orderConfirmed,
    },
  });

  await tx.chatMessage.createMany({
    data: [
      {
        threadId: ids.threadConfirmed,
        senderOrgId: ids.brightview,
        senderUserId: ids.brightviewOwner,
        content: 'Please confirm the Progressive HD lenses for this order.',
        messageType: 'TEXT',
        createdAt: new Date('2026-09-15T10:00:00.000Z'),
      },
      {
        threadId: ids.threadConfirmed,
        senderOrgId: ids.lensline,
        senderUserId: ids.lenslineHandler,
        content: 'Order confirmed and locked.',
        messageType: 'SYSTEM',
        createdAt: new Date('2026-09-15T10:30:00.000Z'),
      },
    ],
  });

  const changeMessage = await tx.chatMessage.create({
    data: {
      threadId: ids.threadConfirmed,
      senderOrgId: ids.brightview,
      senderUserId: ids.brightviewOwner,
      content: 'Can we reduce the quantity from 5 to 4 before dispatch?',
      messageType: 'CHANGE_REQUEST',
      createdAt: new Date('2026-09-16T08:15:00.000Z'),
    },
  });

  await tx.changeRequest.create({
    data: {
      chatMessageId: changeMessage.id,
      orderId: ids.orderConfirmed,
      proposedChanges,
      status: 'PENDING',
    },
  });

  await tx.labJob.create({
    data: {
      id: ids.labJob,
      labOrgId: ids.precision,
      retailerOrgId: ids.brightview,
      retailerInvoiceId: ids.invoiceCredit,
      referenceNumber: 'LJ-1001',
      patientName: 'Ayesha Khan',
      prescription,
      frameDetails,
      specialInstructions: 'AR coating requested.',
      status: 'CUTTING',
      isUrgent: false,
      notes: "Fit into the customer's existing frame.",
    },
  });

  await tx.labJobStatusHistory.create({
    data: {
      labJobId: ids.labJob,
      status: 'CUTTING',
      notes: 'Job received and moved to cutting.',
      changedAt: new Date('2026-09-18T09:00:00.000Z'),
      changedByUserId: ids.precisionTech,
    },
  });

  await tx.labInventory.createMany({
    data: [
      {
        labOrgId: ids.precision,
        name: 'CR-39 1.56 Blanks',
        category: 'Lens blanks',
        quantity: '200.000',
        unit: 'pairs',
        reorderLevel: '40.000',
      },
      {
        labOrgId: ids.precision,
        name: 'Progressive HD Blanks',
        category: 'Lens blanks',
        quantity: '40.000',
        unit: 'pairs',
        reorderLevel: '10.000',
      },
    ],
  });

  await tx.labClient.createMany({
    data: [
      {
        labOrgId: ids.precision,
        name: 'BrightView Optics',
        phone: '+92 300 0000002',
        linkedOrgId: ids.brightview,
        status: 'APPROVED',
      },
      {
        labOrgId: ids.crystal,
        name: 'BrightView Optics',
        phone: '+92 300 0000002',
        linkedOrgId: ids.brightview,
        status: 'APPROVED',
      },
      {
        labOrgId: ids.northstar,
        name: 'BrightView Optics',
        phone: '+92 300 0000002',
        linkedOrgId: ids.brightview,
        status: 'APPROVED',
      },
      {
        labOrgId: ids.precision,
        name: 'City Optical Walk-in',
        phone: '+92 321 2000001',
        linkedOrgId: null,
      },
    ],
  });

  await tx.alert.create({
    data: {
      orgId: ids.brightview,
      userId: ids.brightviewOwner,
      type: 'LOW_STOCK',
      title: 'Anti-Reflective Coating is low',
      body: 'Stock is 2, below the threshold of 5.',
      isRead: false,
      relatedEntityId: ids.batchCoating,
      relatedEntityType: 'InventoryBatch',
    },
  });

  await tx.auditLog.create({
    data: {
      orgId: ids.lensline,
      userId: ids.lenslineAdmin,
      action: 'CONNECTION_APPROVED',
      entityType: 'RetailerConnection',
      entityId: ids.connectionFull,
      metadata: {
        retailerOrgId: ids.brightview,
        visibilityMode: 'FULL',
      },
    },
  });

  await tx.suggestedReplyChip.createMany({ data: replyChips });
}

const replyChips: Array<{
  context: 'NEW_ORDER' | 'PRICE_QUERY' | 'CHANGE_REQUEST' | 'CLOSING' | 'GENERAL';
  label: string;
  text: string;
  displayOrder: number;
}> = [
  ...chipSet('NEW_ORDER', [
    'Yes, all available',
    'Partially available — see below',
    'Out of stock on some items',
    'Call me to discuss',
  ]),
  ...chipSet('PRICE_QUERY', [
    'Price is fixed',
    'Price is final — no changes',
    "Negotiable, let's discuss",
    'Refer to catalog price',
  ]),
  ...chipSet('CHANGE_REQUEST', [
    'Change accepted',
    'Not possible, keeping original',
    'Can do partial — specify qty',
    'Let me check and confirm',
  ]),
  ...chipSet('CLOSING', [
    'Order confirmed — will dispatch shortly',
    'Dispatching today',
    'Price is final, confirming now',
    "It's final — confirm order",
  ]),
  ...chipSet('GENERAL', [
    'Noted',
    'Will update you shortly',
    'Please call me',
    'Confirmed',
    'On it',
  ]),
];

function chipSet(
  context: (typeof replyChips)[number]['context'],
  texts: readonly string[],
): Array<(typeof replyChips)[number]> {
  return texts.map((text, displayOrder) => ({
    context,
    label: text,
    text,
    displayOrder,
  }));
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, BCRYPT_ROUNDS);

  await prisma.$transaction(
    async (tx) => {
      await clearDevData(tx);
      await seed(tx, passwordHash);
    },
    { timeout: 60_000 },
  );

  process.stdout.write(
    `Development data ready. Password for every account: ${DEV_PASSWORD}\n` +
      'superadmin@optiworld.example (SUPER_ADMIN)\n' +
      'owner@brightview.example (OWNER, full catalog)\n' +
      'staff@brightview.example (STAFF)\n' +
      'owner@clearpath.example (OWNER, prices hidden)\n' +
      'staff@clearpath.example (STAFF)\n' +
      'admin@lensline.example (ADMIN)\n' +
      'orders@lensline.example (ORDER_HANDLER)\n' +
      'admin@precisionlab.example (ADMIN)\n' +
      'tech@precisionlab.example (TECHNICIAN)\n' +
      'admin@crystalcut.example (ADMIN)\n' +
      'tech@crystalcut.example (TECHNICIAN)\n' +
      'admin@northstarlab.example (ADMIN)\n' +
      'tech@northstarlab.example (TECHNICIAN)\n',
  );
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Seed failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
